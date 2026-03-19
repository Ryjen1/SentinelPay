from fastapi import FastAPI, HTTPException, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Any
import os
import time
import hashlib
import hmac
import sqlite3
import asyncio
import json
from urllib.parse import urlencode
import re
from datetime import datetime
from dotenv import load_dotenv
from urllib.parse import urlparse
from web3 import Web3
from eth_account import Account
from eth_account.messages import encode_defunct
import traceback
import httpx

# Agent demo integration
from agent.demo_agent import DemoAgent

# Import contract instance from SDK
from sdk.sentinelpay_client import (
    get_vault,
    get_w3,
    get_account,
    call_paid_endpoint,
    MOCK_MODE,
    AGENT_VAULT_ADDRESS,
    ALCHEMY_RPC,
    PRIVATE_KEY,
    USDC_ADDRESS,
    CHAIN_ID,
    NETWORK_NAME,
)

# Environment setup: Priority is process env (Vercel), then local .env
is_vercel = os.getenv("VERCEL") == "1"
if not is_vercel:
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"), override=False)
    load_dotenv(override=False)

print(f"[startup] VAULT_ADDRESS={AGENT_VAULT_ADDRESS}")
print(f"[startup] RPC configured: {bool(ALCHEMY_RPC)}")
print(f"[startup] PRIVATE_KEY configured: {bool(PRIVATE_KEY)}")

# Initialize global references (lazy load)
w3 = get_w3()
agent_vault = get_vault()
account = get_account()

POLICY_REGISTRY_ABI = [
    {
        "name": "owner",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "address"}],
    },
    {
        "name": "getPolicy",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "agentId", "type": "bytes32"}],
        "outputs": [
            {
                "components": [
                    {"name": "maxPerTx", "type": "uint256"},
                    {"name": "dailyCap", "type": "uint256"},
                    {"name": "whitelist", "type": "address[]"},
                    {"name": "isActive", "type": "bool"},
                    {"name": "registeredAt", "type": "uint256"},
                ],
                "type": "tuple",
            }
        ],
    },
    {
        "name": "registerAgent",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "agentId", "type": "bytes32"},
            {"name": "maxPerTx", "type": "uint256"},
            {"name": "dailyCap", "type": "uint256"},
            {"name": "whitelist", "type": "address[]"},
        ],
        "outputs": [],
    },
    {
        "name": "unpauseAgent",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "agentId", "type": "bytes32"}],
        "outputs": [],
    },
]

policy_registry = None


def _discover_policy_registry_address() -> Optional[str]:
    _vault = get_vault()
    if not _vault:
        return None
    try:
        addr = _vault.functions.policyRegistry().call()
    except Exception as exc:
        print(f"[startup] Failed to read policyRegistry from vault: {exc}")
        return None
    if isinstance(addr, str) and Web3.is_address(addr) and int(addr, 16) != 0:
        return Web3.to_checksum_address(addr)
    return None


def get_policy_registry():
    global policy_registry
    global POLICY_REGISTRY_ADDRESS
    if policy_registry is None and w3:
        address = POLICY_REGISTRY_ADDRESS
        if not address:
            discovered = _discover_policy_registry_address()
            if discovered:
                address = discovered
                POLICY_REGISTRY_ADDRESS = discovered
                print(f"[startup] PolicyRegistry discovered from vault: {POLICY_REGISTRY_ADDRESS}")
        if address:
            try:
                policy_registry = w3.eth.contract(
                    address=Web3.to_checksum_address(address),
                    abi=POLICY_REGISTRY_ABI,
                )
            except Exception as exc:
                print(f"[startup] Failed to init PolicyRegistry: {exc}")
                policy_registry = None
    return policy_registry


def reset_policy_registry():
    global policy_registry
    policy_registry = None
    return get_policy_registry()


def _parse_bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise RuntimeError(f"{name} must be a boolean-like value (true/false)")


def _normalized_operator_keys(raw: str) -> set[str]:
    return {item.strip() for item in raw.split(",") if item.strip()}


def _parse_int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw.strip())
    except Exception as exc:
        raise RuntimeError(f"{name} must be an integer") from exc
    return value


def _parse_float_env(name: str) -> Optional[float]:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return None
    try:
        return float(raw.strip())
    except Exception as exc:
        raise RuntimeError(f"{name} must be a number") from exc


def _sqlite_path_from_url(database_url: str) -> str:
    if database_url == "sqlite:///:memory:":
        return ":memory:"
    if database_url.startswith("sqlite:////"):
        return f"/{database_url[len('sqlite:////'):]}"
    if database_url.startswith("sqlite:///"):
        return database_url[len("sqlite:///"):]
    if database_url.startswith("sqlite://"):
        return database_url[len("sqlite://"):]
    return "db/transactions.db"


def _default_sqlite_url() -> str:
    if os.getenv("VERCEL"):
        return "sqlite:////tmp/sentinelpay.db"
    return "sqlite:///./db/transactions.db"


def _default_payment_worker_enabled() -> bool:
    return False if os.getenv("VERCEL") else True

DEFAULT_AGENT_ID = os.getenv("DEFAULT_AGENT_ID", "weather_agent")
DEFAULT_RECIPIENT = os.getenv("DEFAULT_RECIPIENT", "0x61254AEcF84eEdb890f07dD29f7F3cd3b8Eb2CBe")
POLICY_REGISTRY_ADDRESS = os.getenv("POLICY_REGISTRY_ADDRESS", "")
print(f"[startup] POLICY_REGISTRY_ADDRESS={POLICY_REGISTRY_ADDRESS}")
DEFAULT_MAX_PER_TX_USDC = float(os.getenv("DEFAULT_MAX_PER_TX_USDC", "1.0"))
DEFAULT_DAILY_CAP_USDC = float(os.getenv("DEFAULT_DAILY_CAP_USDC", "5.0"))
WEATHER_PRICE_USDC = float(os.getenv("WEATHER_PRICE_USDC", "0.001"))
DATA_FEED_PRICE_USDC = float(os.getenv("DATA_FEED_PRICE_USDC", "0.002"))
DEMO_EXECUTION_AMOUNT_USDC = float(os.getenv("DEMO_EXECUTION_AMOUNT_USDC", "0.50"))
PAYMENT_TOKEN_SYMBOL = os.getenv("PAYMENT_TOKEN_SYMBOL", "USDC")
PAYMENT_TOKEN_ADDRESS = USDC_ADDRESS or os.getenv("PAYMENT_TOKEN_ADDRESS", "")
NETWORK_LABEL = os.getenv("NETWORK_LABEL", f"{NETWORK_NAME} Testnet")
NETWORK_RATIONALE = os.getenv(
    "NETWORK_RATIONALE",
    "Low fees and fast confirmations make agentic micro-payments on Celo practical.",
)
EXPLORER_TX_BASE_URL = os.getenv("EXPLORER_TX_BASE_URL", "https://sepolia.celoscan.io/tx")
LIVE_MARKET_DATA = _parse_bool_env("LIVE_MARKET_DATA", False)
MARKET_DATA_TIMEOUT_SECONDS = float(os.getenv("MARKET_DATA_TIMEOUT_SECONDS", "6"))
LIVE_WEATHER_DATA = _parse_bool_env("LIVE_WEATHER_DATA", False)
WEATHER_CITY = os.getenv("WEATHER_CITY", "Bangalore")
WEATHER_LATITUDE = _parse_float_env("WEATHER_LATITUDE")
WEATHER_LONGITUDE = _parse_float_env("WEATHER_LONGITUDE")
WEATHER_DATA_TIMEOUT_SECONDS = float(os.getenv("WEATHER_DATA_TIMEOUT_SECONDS", "6"))
REQUIRE_WALLET_SIGNATURE = _parse_bool_env("REQUIRE_WALLET_SIGNATURE", False)
WALLET_SIGNATURE_MAX_SKEW_SECONDS = _parse_int_env("WALLET_SIGNATURE_MAX_SKEW_SECONDS", 300)
REQUIRE_OPERATOR_AUTH = _parse_bool_env("REQUIRE_OPERATOR_AUTH", False)
REQUIRE_IDEMPOTENCY_KEY = _parse_bool_env("REQUIRE_IDEMPOTENCY_KEY", False)
OPERATOR_API_KEYS = _normalized_operator_keys(os.getenv("OPERATOR_API_KEYS", ""))
REQUIRE_AGENT_SIGNATURE = _parse_bool_env("REQUIRE_AGENT_SIGNATURE", False)
AGENT_SHARED_SECRET = os.getenv("AGENT_SHARED_SECRET", "")
AGENT_SIGNATURE_MAX_SKEW_SECONDS = _parse_int_env("AGENT_SIGNATURE_MAX_SKEW_SECONDS", 300)
PAYMENT_WORKER_ENABLED = _parse_bool_env("PAYMENT_WORKER_ENABLED", _default_payment_worker_enabled())
PAYMENT_JOB_MAX_ATTEMPTS = _parse_int_env("PAYMENT_JOB_MAX_ATTEMPTS", 3)
PAYMENT_JOB_RETRY_BASE_SECONDS = _parse_int_env("PAYMENT_JOB_RETRY_BASE_SECONDS", 2)
PAYMENT_JOB_WAIT_TIMEOUT_SECONDS = _parse_int_env("PAYMENT_JOB_WAIT_TIMEOUT_SECONDS", 120)
PAYMENT_WORKER_POLL_MS = _parse_int_env("PAYMENT_WORKER_POLL_MS", 400)

# Latest paid market/weather snapshots (in-memory)
LAST_MARKET_SNAPSHOT_BY_AGENT: dict[str, dict[str, Any]] = {}
LAST_MARKET_CAPTURED_AT_BY_AGENT: dict[str, float] = {}
LAST_WEATHER_SNAPSHOT_BY_AGENT: dict[str, dict[str, Any]] = {}
LAST_WEATHER_CAPTURED_AT_BY_AGENT: dict[str, float] = {}

app = FastAPI(title="SentinelPay API")

# CORS configuration
cors_origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Database:
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.backend = "postgres" if database_url.startswith(("postgres://", "postgresql://", "postgresql+asyncpg://")) else "sqlite"
        self.sqlite_path = _sqlite_path_from_url(database_url)
        self.pg_pool = None

    async def init(self):
        if self.backend == "sqlite":
            if self.sqlite_path != ":memory:":
                sqlite_dir = os.path.dirname(self.sqlite_path)
                if sqlite_dir:
                    os.makedirs(sqlite_dir, exist_ok=True)
            await asyncio.to_thread(self._sqlite_init)
            return

        try:
            import asyncpg
        except ImportError:
            raise RuntimeError(
                "DATABASE_URL points to Postgres but asyncpg is not installed. "
                "Install backend requirements before starting in Postgres mode."
            )

        pg_url = self.database_url
        if pg_url.startswith("postgresql+asyncpg://"):
            pg_url = pg_url.replace("postgresql+asyncpg://", "postgresql://", 1)
        elif pg_url.startswith("postgres://"):
            pg_url = pg_url.replace("postgres://", "postgresql://", 1)

        self.pg_pool = await asyncpg.create_pool(pg_url)
        async with self.pg_pool.acquire() as conn:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS transactions (
                    id BIGSERIAL PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    recipient TEXT NOT NULL,
                    amount_usdc DOUBLE PRECISION NOT NULL,
                    tx_hash TEXT NOT NULL UNIQUE,
                    status TEXT NOT NULL,
                    block_reason TEXT,
                    timestamp BIGINT NOT NULL,
                    created_at TEXT NOT NULL,
                    block_number BIGINT NOT NULL DEFAULT 0,
                    gas_used BIGINT NOT NULL DEFAULT 0
                )
                """
            )
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS idempotency_keys (
                    idempotency_key TEXT PRIMARY KEY,
                    endpoint TEXT NOT NULL,
                    request_hash TEXT NOT NULL,
                    status TEXT NOT NULL,
                    response_json TEXT,
                    error_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS payment_jobs (
                    id BIGSERIAL PRIMARY KEY,
                    job_key TEXT NOT NULL UNIQUE,
                    agent_id TEXT NOT NULL,
                    recipient TEXT NOT NULL,
                    amount_usdc DOUBLE PRECISION NOT NULL,
                    status TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    max_attempts INTEGER NOT NULL,
                    next_retry_at BIGINT NOT NULL,
                    tx_hash TEXT,
                    response_json TEXT,
                    last_error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    def _sqlite_init(self):
        conn = sqlite3.connect(self.sqlite_path)
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                recipient TEXT NOT NULL,
                amount_usdc REAL NOT NULL,
                tx_hash TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL,
                block_reason TEXT,
                timestamp INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                block_number INTEGER NOT NULL DEFAULT 0,
                gas_used INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS idempotency_keys (
                idempotency_key TEXT PRIMARY KEY,
                endpoint TEXT NOT NULL,
                request_hash TEXT NOT NULL,
                status TEXT NOT NULL,
                response_json TEXT,
                error_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS payment_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_key TEXT NOT NULL UNIQUE,
                agent_id TEXT NOT NULL,
                recipient TEXT NOT NULL,
                amount_usdc REAL NOT NULL,
                status TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                max_attempts INTEGER NOT NULL,
                next_retry_at INTEGER NOT NULL,
                tx_hash TEXT,
                response_json TEXT,
                last_error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.commit()
        conn.close()

    async def insert_transaction(self, payload: dict) -> int:
        if self.backend == "sqlite":
            return await asyncio.to_thread(self._sqlite_insert, payload)

        async with self.pg_pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO transactions (
                    agent_id, recipient, amount_usdc, tx_hash, status, block_reason,
                    timestamp, created_at, block_number, gas_used
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                ON CONFLICT (tx_hash) DO NOTHING
                RETURNING id
                """,
                payload["agent_id"],
                payload["recipient"],
                payload["amount_usdc"],
                payload["tx_hash"],
                payload["status"],
                payload["block_reason"],
                payload["timestamp"],
                payload["created_at"],
                payload["block_number"],
                payload["gas_used"],
            )

            if not row:
                raise HTTPException(status_code=409, detail={"error": "Duplicate transaction hash"})
            return int(row["id"])

    def _sqlite_insert(self, payload: dict) -> int:
        conn = sqlite3.connect(self.sqlite_path)
        cur = conn.cursor()
        try:
            cur.execute(
                """
                INSERT INTO transactions (
                    agent_id, recipient, amount_usdc, tx_hash, status, block_reason,
                    timestamp, created_at, block_number, gas_used
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["agent_id"],
                    payload["recipient"],
                    payload["amount_usdc"],
                    payload["tx_hash"],
                    payload["status"],
                    payload["block_reason"],
                    payload["timestamp"],
                    payload["created_at"],
                    payload["block_number"],
                    payload["gas_used"],
                ),
            )
            conn.commit()
            return int(cur.lastrowid)
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail={"error": "Duplicate transaction hash"})
        finally:
            conn.close()

    async def fetch_transactions(self, limit: int = 50, agent_id: Optional[str] = None):
        if self.backend == "sqlite":
            return await asyncio.to_thread(self._sqlite_fetch, limit, agent_id)

        async with self.pg_pool.acquire() as conn:
            if agent_id:
                rows = await conn.fetch(
                    """
                    SELECT id, agent_id, recipient, amount_usdc, tx_hash, status, block_reason,
                           timestamp, created_at, block_number, gas_used
                    FROM transactions
                    WHERE agent_id = $1
                    ORDER BY timestamp DESC
                    LIMIT $2
                    """,
                    agent_id,
                    limit,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT id, agent_id, recipient, amount_usdc, tx_hash, status, block_reason,
                           timestamp, created_at, block_number, gas_used
                    FROM transactions
                    ORDER BY timestamp DESC
                    LIMIT $1
                    """,
                    limit,
                )
            return [dict(row) for row in rows]

    def _sqlite_fetch(self, limit: int, agent_id: Optional[str]):
        conn = sqlite3.connect(self.sqlite_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        if agent_id:
            cur.execute(
                """
                SELECT id, agent_id, recipient, amount_usdc, tx_hash, status, block_reason,
                       timestamp, created_at, block_number, gas_used
                FROM transactions
                WHERE agent_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
                """,
                (agent_id, limit),
            )
        else:
            cur.execute(
                """
                SELECT id, agent_id, recipient, amount_usdc, tx_hash, status, block_reason,
                       timestamp, created_at, block_number, gas_used
                FROM transactions
                ORDER BY timestamp DESC
                LIMIT ?
                """,
                (limit,),
            )
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows

    async def tx_hash_exists(self, tx_hash: str) -> bool:
        if self.backend == "sqlite":
            return await asyncio.to_thread(self._sqlite_exists, tx_hash)

        async with self.pg_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT 1 FROM transactions WHERE tx_hash = $1 LIMIT 1",
                tx_hash,
            )
            return row is not None

    def _sqlite_exists(self, tx_hash: str) -> bool:
        conn = sqlite3.connect(self.sqlite_path)
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM transactions WHERE tx_hash = ? LIMIT 1", (tx_hash,))
        row = cur.fetchone()
        conn.close()
        return row is not None

    async def get_idempotency_record(self, key: str) -> Optional[dict]:
        if self.backend == "sqlite":
            return await asyncio.to_thread(self._sqlite_get_idempotency_record, key)

        async with self.pg_pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT idempotency_key, endpoint, request_hash, status, response_json, error_json, created_at, updated_at
                FROM idempotency_keys
                WHERE idempotency_key = $1
                LIMIT 1
                """,
                key,
            )
            return dict(row) if row else None

    def _sqlite_get_idempotency_record(self, key: str) -> Optional[dict]:
        conn = sqlite3.connect(self.sqlite_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(
            """
            SELECT idempotency_key, endpoint, request_hash, status, response_json, error_json, created_at, updated_at
            FROM idempotency_keys
            WHERE idempotency_key = ?
            LIMIT 1
            """,
            (key,),
        )
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None

    async def create_idempotency_record(self, *, key: str, endpoint: str, request_hash: str) -> bool:
        if self.backend == "sqlite":
            return await asyncio.to_thread(
                self._sqlite_create_idempotency_record,
                key,
                endpoint,
                request_hash,
            )

        now = datetime.utcnow().isoformat()
        async with self.pg_pool.acquire() as conn:
            result = await conn.execute(
                """
                INSERT INTO idempotency_keys (
                    idempotency_key, endpoint, request_hash, status, response_json, error_json, created_at, updated_at
                ) VALUES ($1,$2,$3,'in_progress',NULL,NULL,$4,$4)
                ON CONFLICT (idempotency_key) DO NOTHING
                """,
                key,
                endpoint,
                request_hash,
                now,
            )
            return result.endswith("1")

    def _sqlite_create_idempotency_record(self, key: str, endpoint: str, request_hash: str) -> bool:
        conn = sqlite3.connect(self.sqlite_path)
        cur = conn.cursor()
        now = datetime.utcnow().isoformat()
        try:
            cur.execute(
                """
                INSERT INTO idempotency_keys (
                    idempotency_key, endpoint, request_hash, status, response_json, error_json, created_at, updated_at
                ) VALUES (?, ?, ?, 'in_progress', NULL, NULL, ?, ?)
                """,
                (key, endpoint, request_hash, now, now),
            )
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False
        finally:
            conn.close()

    async def finalize_idempotency_record(
        self,
        *,
        key: str,
        status: str,
        response_json: Optional[str],
        error_json: Optional[str],
    ) -> None:
        if self.backend == "sqlite":
            await asyncio.to_thread(
                self._sqlite_finalize_idempotency_record,
                key,
                status,
                response_json,
                error_json,
            )
            return

        now = datetime.utcnow().isoformat()
        async with self.pg_pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE idempotency_keys
                SET status = $2, response_json = $3, error_json = $4, updated_at = $5
                WHERE idempotency_key = $1
                """,
                key,
                status,
                response_json,
                error_json,
                now,
            )

    def _sqlite_finalize_idempotency_record(
        self,
        key: str,
        status: str,
        response_json: Optional[str],
        error_json: Optional[str],
    ) -> None:
        conn = sqlite3.connect(self.sqlite_path)
        cur = conn.cursor()
        now = datetime.utcnow().isoformat()
        cur.execute(
            """
            UPDATE idempotency_keys
            SET status = ?, response_json = ?, error_json = ?, updated_at = ?
            WHERE idempotency_key = ?
            """,
            (status, response_json, error_json, now, key),
        )
        conn.commit()
        conn.close()

    async def enqueue_payment_job(
        self,
        *,
        job_key: str,
        agent_id: str,
        recipient: str,
        amount_usdc: float,
        max_attempts: int,
        next_retry_at: int,
    ) -> dict:
        if self.backend == "sqlite":
            return await asyncio.to_thread(
                self._sqlite_enqueue_payment_job,
                job_key,
                agent_id,
                recipient,
                amount_usdc,
                max_attempts,
                next_retry_at,
            )

        now = datetime.utcnow().isoformat()
        async with self.pg_pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO payment_jobs (
                    job_key, agent_id, recipient, amount_usdc, status, attempts, max_attempts,
                    next_retry_at, tx_hash, response_json, last_error, created_at, updated_at
                ) VALUES ($1,$2,$3,$4,'queued',0,$5,$6,NULL,NULL,NULL,$7,$7)
                ON CONFLICT (job_key) DO NOTHING
                RETURNING id, job_key, agent_id, recipient, amount_usdc, status, attempts, max_attempts,
                          next_retry_at, tx_hash, response_json, last_error, created_at, updated_at
                """,
                job_key,
                agent_id,
                recipient,
                amount_usdc,
                max_attempts,
                next_retry_at,
                now,
            )
            if row:
                return dict(row)
            existing = await conn.fetchrow(
                """
                SELECT id, job_key, agent_id, recipient, amount_usdc, status, attempts, max_attempts,
                       next_retry_at, tx_hash, response_json, last_error, created_at, updated_at
                FROM payment_jobs
                WHERE job_key = $1
                LIMIT 1
                """,
                job_key,
            )
            return dict(existing)

    def _sqlite_enqueue_payment_job(
        self,
        job_key: str,
        agent_id: str,
        recipient: str,
        amount_usdc: float,
        max_attempts: int,
        next_retry_at: int,
    ) -> dict:
        conn = sqlite3.connect(self.sqlite_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        now = datetime.utcnow().isoformat()
        try:
            cur.execute(
                """
                INSERT INTO payment_jobs (
                    job_key, agent_id, recipient, amount_usdc, status, attempts, max_attempts,
                    next_retry_at, tx_hash, response_json, last_error, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'queued', 0, ?, ?, NULL, NULL, NULL, ?, ?)
                """,
                (job_key, agent_id, recipient, amount_usdc, max_attempts, next_retry_at, now, now),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            pass
        finally:
            cur.execute(
                """
                SELECT id, job_key, agent_id, recipient, amount_usdc, status, attempts, max_attempts,
                       next_retry_at, tx_hash, response_json, last_error, created_at, updated_at
                FROM payment_jobs
                WHERE job_key = ?
                LIMIT 1
                """,
                (job_key,),
            )
            row = cur.fetchone()
            conn.close()
        return dict(row)

    async def get_payment_job_by_key(self, job_key: str) -> Optional[dict]:
        if self.backend == "sqlite":
            return await asyncio.to_thread(self._sqlite_get_payment_job_by_key, job_key)

        async with self.pg_pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, job_key, agent_id, recipient, amount_usdc, status, attempts, max_attempts,
                       next_retry_at, tx_hash, response_json, last_error, created_at, updated_at
                FROM payment_jobs
                WHERE job_key = $1
                LIMIT 1
                """,
                job_key,
            )
            return dict(row) if row else None

    def _sqlite_get_payment_job_by_key(self, job_key: str) -> Optional[dict]:
        conn = sqlite3.connect(self.sqlite_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, job_key, agent_id, recipient, amount_usdc, status, attempts, max_attempts,
                   next_retry_at, tx_hash, response_json, last_error, created_at, updated_at
            FROM payment_jobs
            WHERE job_key = ?
            LIMIT 1
            """,
            (job_key,),
        )
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None

    async def claim_next_payment_job(self, now_ts: int) -> Optional[dict]:
        if self.backend == "sqlite":
            return await asyncio.to_thread(self._sqlite_claim_next_payment_job, now_ts)

        now = datetime.utcnow().isoformat()
        async with self.pg_pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                WITH candidate AS (
                    SELECT id
                    FROM payment_jobs
                    WHERE status IN ('queued', 'retry')
                      AND next_retry_at <= $1
                    ORDER BY id
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                UPDATE payment_jobs pj
                SET status = 'running',
                    attempts = pj.attempts + 1,
                    updated_at = $2
                FROM candidate
                WHERE pj.id = candidate.id
                RETURNING pj.id, pj.job_key, pj.agent_id, pj.recipient, pj.amount_usdc, pj.status,
                          pj.attempts, pj.max_attempts, pj.next_retry_at, pj.tx_hash, pj.response_json,
                          pj.last_error, pj.created_at, pj.updated_at
                """,
                now_ts,
                now,
            )
            return dict(row) if row else None

    def _sqlite_claim_next_payment_job(self, now_ts: int) -> Optional[dict]:
        conn = sqlite3.connect(self.sqlite_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        try:
            cur.execute("BEGIN IMMEDIATE")
            cur.execute(
                """
                SELECT id
                FROM payment_jobs
                WHERE status IN ('queued', 'retry')
                  AND next_retry_at <= ?
                ORDER BY id
                LIMIT 1
                """,
                (now_ts,),
            )
            row = cur.fetchone()
            if not row:
                conn.commit()
                return None

            now = datetime.utcnow().isoformat()
            cur.execute(
                """
                UPDATE payment_jobs
                SET status = 'running',
                    attempts = attempts + 1,
                    updated_at = ?
                WHERE id = ?
                """,
                (now, row["id"]),
            )
            cur.execute(
                """
                SELECT id, job_key, agent_id, recipient, amount_usdc, status, attempts, max_attempts,
                       next_retry_at, tx_hash, response_json, last_error, created_at, updated_at
                FROM payment_jobs
                WHERE id = ?
                LIMIT 1
                """,
                (row["id"],),
            )
            claimed = cur.fetchone()
            conn.commit()
            return dict(claimed) if claimed else None
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    async def mark_payment_job_success(self, *, job_key: str, tx_hash: str, response_json: str) -> None:
        if self.backend == "sqlite":
            await asyncio.to_thread(self._sqlite_mark_payment_job_success, job_key, tx_hash, response_json)
            return

        now = datetime.utcnow().isoformat()
        async with self.pg_pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE payment_jobs
                SET status = 'succeeded',
                    tx_hash = $2,
                    response_json = $3,
                    last_error = NULL,
                    updated_at = $4
                WHERE job_key = $1
                """,
                job_key,
                tx_hash,
                response_json,
                now,
            )

    def _sqlite_mark_payment_job_success(self, job_key: str, tx_hash: str, response_json: str) -> None:
        conn = sqlite3.connect(self.sqlite_path)
        cur = conn.cursor()
        now = datetime.utcnow().isoformat()
        cur.execute(
            """
            UPDATE payment_jobs
            SET status = 'succeeded',
                tx_hash = ?,
                response_json = ?,
                last_error = NULL,
                updated_at = ?
            WHERE job_key = ?
            """,
            (tx_hash, response_json, now, job_key),
        )
        conn.commit()
        conn.close()

    async def mark_payment_job_retry_or_dead(
        self,
        *,
        job_key: str,
        status: str,
        next_retry_at: int,
        last_error: str,
    ) -> None:
        if self.backend == "sqlite":
            await asyncio.to_thread(
                self._sqlite_mark_payment_job_retry_or_dead,
                job_key,
                status,
                next_retry_at,
                last_error,
            )
            return

        now = datetime.utcnow().isoformat()
        async with self.pg_pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE payment_jobs
                SET status = $2,
                    next_retry_at = $3,
                    last_error = $4,
                    updated_at = $5
                WHERE job_key = $1
                """,
                job_key,
                status,
                next_retry_at,
                last_error,
                now,
            )

    def _sqlite_mark_payment_job_retry_or_dead(
        self,
        job_key: str,
        status: str,
        next_retry_at: int,
        last_error: str,
    ) -> None:
        conn = sqlite3.connect(self.sqlite_path)
        cur = conn.cursor()
        now = datetime.utcnow().isoformat()
        cur.execute(
            """
            UPDATE payment_jobs
            SET status = ?,
                next_retry_at = ?,
                last_error = ?,
                updated_at = ?
            WHERE job_key = ?
            """,
            (status, next_retry_at, last_error, now, job_key),
        )
        conn.commit()
        conn.close()

    async def fetch_payment_jobs(self, *, status: Optional[str] = None, limit: int = 50) -> list[dict]:
        if self.backend == "sqlite":
            return await asyncio.to_thread(self._sqlite_fetch_payment_jobs, status, limit)

        async with self.pg_pool.acquire() as conn:
            if status:
                rows = await conn.fetch(
                    """
                    SELECT id, job_key, agent_id, recipient, amount_usdc, status, attempts, max_attempts,
                           next_retry_at, tx_hash, response_json, last_error, created_at, updated_at
                    FROM payment_jobs
                    WHERE status = $1
                    ORDER BY id DESC
                    LIMIT $2
                    """,
                    status,
                    limit,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT id, job_key, agent_id, recipient, amount_usdc, status, attempts, max_attempts,
                           next_retry_at, tx_hash, response_json, last_error, created_at, updated_at
                    FROM payment_jobs
                    ORDER BY id DESC
                    LIMIT $1
                    """,
                    limit,
                )
            return [dict(row) for row in rows]

    def _sqlite_fetch_payment_jobs(self, status: Optional[str], limit: int) -> list[dict]:
        conn = sqlite3.connect(self.sqlite_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        if status:
            cur.execute(
                """
                SELECT id, job_key, agent_id, recipient, amount_usdc, status, attempts, max_attempts,
                       next_retry_at, tx_hash, response_json, last_error, created_at, updated_at
                FROM payment_jobs
                WHERE status = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (status, limit),
            )
        else:
            cur.execute(
                """
                SELECT id, job_key, agent_id, recipient, amount_usdc, status, attempts, max_attempts,
                       next_retry_at, tx_hash, response_json, last_error, created_at, updated_at
                FROM payment_jobs
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            )
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows


DEFAULT_SQLITE_URL = _default_sqlite_url()


def _resolve_database_url() -> str:
    raw = os.getenv("DATABASE_URL")
    if not raw:
        return DEFAULT_SQLITE_URL

    if raw.startswith(("postgres://", "postgresql://", "postgresql+asyncpg://")):
        normalized = raw.replace("postgresql+asyncpg://", "postgresql://", 1)
        host = urlparse(normalized).hostname
        if os.getenv("RENDER") and host in {"localhost", "127.0.0.1", "::1"}:
            print("[!] DATABASE_URL points to localhost on Render; falling back to SQLite.")
            return DEFAULT_SQLITE_URL

    return raw


DATABASE_URL = _resolve_database_url()
db = Database(DATABASE_URL)
PAYMENT_WORKER_TASK: Optional[asyncio.Task] = None
PAYMENT_WORKER_STOP_EVENT: Optional[asyncio.Event] = None
NONCE_LOCK = asyncio.Lock()
NONCE_CACHE: Optional[int] = None


def _agent_signature_message(*, agent_id: str, timestamp: str, method: str, path: str, body_bytes: bytes) -> str:
    body_hash = hashlib.sha256(body_bytes).hexdigest()
    return f"{agent_id}:{timestamp}:{method.upper()}:{path}:{body_hash}"


def _agent_signature_for_message(message: str) -> str:
    return hmac.new(AGENT_SHARED_SECRET.encode(), message.encode(), hashlib.sha256).hexdigest()


def _wallet_signature_message(*, address: str, timestamp: str, agent_id: str, path: str) -> str:
    return (
        "SentinelPay Demo Authorization\n"
        f"Address: {address}\n"
        f"AgentId: {agent_id}\n"
        f"Timestamp: {timestamp}\n"
        f"Path: {path}"
    )


def _validate_runtime_config() -> None:
    if not DEFAULT_AGENT_ID.strip():
        raise RuntimeError("DEFAULT_AGENT_ID cannot be empty")
    if not Web3.is_address(DEFAULT_RECIPIENT):
        raise RuntimeError("DEFAULT_RECIPIENT must be a valid EVM address")
    if WEATHER_PRICE_USDC <= 0 or DATA_FEED_PRICE_USDC <= 0 or DEMO_EXECUTION_AMOUNT_USDC <= 0:
        raise RuntimeError("Pricing amounts must be greater than 0")
    if not EXPLORER_TX_BASE_URL.startswith(("http://", "https://")):
        raise RuntimeError("EXPLORER_TX_BASE_URL must be an http(s) URL")
    if REQUIRE_OPERATOR_AUTH and not OPERATOR_API_KEYS:
        raise RuntimeError("REQUIRE_OPERATOR_AUTH=true but OPERATOR_API_KEYS is empty")
    if REQUIRE_AGENT_SIGNATURE and not AGENT_SHARED_SECRET:
        raise RuntimeError("REQUIRE_AGENT_SIGNATURE=true but AGENT_SHARED_SECRET is empty")
    if AGENT_SIGNATURE_MAX_SKEW_SECONDS <= 0:
        raise RuntimeError("AGENT_SIGNATURE_MAX_SKEW_SECONDS must be greater than 0")
    if REQUIRE_WALLET_SIGNATURE and WALLET_SIGNATURE_MAX_SKEW_SECONDS <= 0:
        raise RuntimeError("WALLET_SIGNATURE_MAX_SKEW_SECONDS must be greater than 0")
    if PAYMENT_JOB_MAX_ATTEMPTS <= 0:
        raise RuntimeError("PAYMENT_JOB_MAX_ATTEMPTS must be greater than 0")
    if PAYMENT_JOB_RETRY_BASE_SECONDS <= 0:
        raise RuntimeError("PAYMENT_JOB_RETRY_BASE_SECONDS must be greater than 0")
    if PAYMENT_JOB_WAIT_TIMEOUT_SECONDS <= 0:
        raise RuntimeError("PAYMENT_JOB_WAIT_TIMEOUT_SECONDS must be greater than 0")
    if PAYMENT_WORKER_POLL_MS <= 0:
        raise RuntimeError("PAYMENT_WORKER_POLL_MS must be greater than 0")


def require_operator_access(x_operator_key: Optional[str] = Header(None, alias="X-Operator-Key")) -> None:
    if not REQUIRE_OPERATOR_AUTH:
        return
    if not x_operator_key:
        raise HTTPException(status_code=401, detail={"error": "Missing X-Operator-Key"})
    if x_operator_key not in OPERATOR_API_KEYS:
        raise HTTPException(status_code=401, detail={"error": "Invalid operator key"})


async def require_agent_signature(
    request: Request,
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-Id"),
    x_agent_timestamp: Optional[str] = Header(None, alias="X-Agent-Timestamp"),
    x_agent_signature: Optional[str] = Header(None, alias="X-Agent-Signature"),
) -> None:
    if not REQUIRE_AGENT_SIGNATURE:
        return

    if not x_agent_id or not x_agent_timestamp or not x_agent_signature:
        raise HTTPException(status_code=401, detail={"error": "Missing agent signature headers"})

    try:
        ts = int(x_agent_timestamp)
    except Exception:
        raise HTTPException(status_code=401, detail={"error": "Invalid X-Agent-Timestamp"})

    now = int(time.time())
    if abs(now - ts) > AGENT_SIGNATURE_MAX_SKEW_SECONDS:
        raise HTTPException(status_code=401, detail={"error": "Agent signature timestamp is outside allowed skew"})

    body_bytes = await request.body()
    message = _agent_signature_message(
        agent_id=x_agent_id,
        timestamp=x_agent_timestamp,
        method=request.method,
        path=request.url.path,
        body_bytes=body_bytes,
    )
    expected = _agent_signature_for_message(message)
    if not hmac.compare_digest(expected, x_agent_signature):
        raise HTTPException(status_code=401, detail={"error": "Invalid agent signature"})


async def require_wallet_signature(
    request: Request,
    x_wallet_address: Optional[str] = Header(None, alias="X-Wallet-Address"),
    x_wallet_signature: Optional[str] = Header(None, alias="X-Wallet-Signature"),
    x_wallet_timestamp: Optional[str] = Header(None, alias="X-Wallet-Timestamp"),
    x_wallet_agent_id: Optional[str] = Header(None, alias="X-Wallet-Agent-Id"),
) -> None:
    if not REQUIRE_WALLET_SIGNATURE:
        return
    if not x_wallet_address or not x_wallet_signature or not x_wallet_timestamp or not x_wallet_agent_id:
        raise HTTPException(status_code=401, detail={"error": "Missing wallet signature headers"})
    if not Web3.is_address(x_wallet_address):
        raise HTTPException(status_code=401, detail={"error": "Invalid wallet address"})
    try:
        ts = int(x_wallet_timestamp)
    except Exception as exc:
        raise HTTPException(status_code=401, detail={"error": "Invalid wallet signature timestamp"}) from exc
    if abs(int(time.time()) - ts) > WALLET_SIGNATURE_MAX_SKEW_SECONDS:
        raise HTTPException(status_code=401, detail={"error": "Wallet signature timestamp is outside allowed skew"})

    message = _wallet_signature_message(
        address=Web3.to_checksum_address(x_wallet_address),
        timestamp=x_wallet_timestamp,
        agent_id=x_wallet_agent_id,
        path=request.url.path,
    )
    recovered = Account.recover_message(encode_defunct(text=message), signature=x_wallet_signature)
    if recovered.lower() != x_wallet_address.lower():
        raise HTTPException(status_code=401, detail={"error": "Invalid wallet signature"})


def _idempotency_payload_hash(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode()).hexdigest()


def _json_loads_if_any(raw: Optional[str]) -> Optional[dict]:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def _normalize_error_detail(detail: Any) -> dict:
    if isinstance(detail, dict):
        return detail
    if isinstance(detail, str):
        parsed = _json_loads_if_any(detail)
        if isinstance(parsed, dict):
            return parsed
        return {"error": detail}
    return {"error": str(detail)}


async def _run_idempotent(
    *,
    key: Optional[str],
    endpoint: str,
    payload: dict,
    action,
) -> Any:
    if not key:
        if REQUIRE_IDEMPOTENCY_KEY:
            raise HTTPException(status_code=400, detail={"error": "Missing Idempotency-Key header"})
        return await action()

    if len(key) > 128:
        raise HTTPException(status_code=400, detail={"error": "Idempotency-Key is too long"})

    request_hash = _idempotency_payload_hash(payload)
    existing = await db.get_idempotency_record(key)
    if existing:
        if existing["endpoint"] != endpoint:
            raise HTTPException(status_code=409, detail={"error": "Idempotency key already used on a different endpoint"})
        if existing["request_hash"] != request_hash:
            raise HTTPException(status_code=409, detail={"error": "Idempotency key payload mismatch"})
        if existing["status"] == "completed":
            replay = _json_loads_if_any(existing["response_json"])
            if replay is not None:
                return replay
        if existing["status"] == "failed":
            saved_error = _json_loads_if_any(existing["error_json"]) or {"error": "Previous request failed"}
            raise HTTPException(status_code=409, detail=saved_error)
        raise HTTPException(status_code=409, detail={"error": "Request for this idempotency key is still in progress"})

    created = await db.create_idempotency_record(key=key, endpoint=endpoint, request_hash=request_hash)
    if not created:
        # Handle race where another worker inserted between our read and write.
        conflict = await db.get_idempotency_record(key)
        if conflict and conflict.get("status") == "completed":
            replay = _json_loads_if_any(conflict.get("response_json"))
            if replay is not None:
                return replay
        raise HTTPException(status_code=409, detail={"error": "Idempotency key is currently locked"})

    try:
        result = await action()
        await db.finalize_idempotency_record(
            key=key,
            status="completed",
            response_json=json.dumps(result, separators=(",", ":"), sort_keys=True),
            error_json=None,
        )
        return result
    except HTTPException as exc:
        await db.finalize_idempotency_record(
            key=key,
            status="failed",
            response_json=None,
            error_json=json.dumps(exc.detail, separators=(",", ":"), sort_keys=True),
        )
        raise
    except Exception as exc:
        await db.finalize_idempotency_record(
            key=key,
            status="failed",
            response_json=None,
            error_json=json.dumps({"error": str(exc)}, separators=(",", ":"), sort_keys=True),
        )
        raise


def _job_error_payload(exc: Exception) -> dict:
    if isinstance(exc, HTTPException):
        detail = _normalize_error_detail(exc.detail)
        if "status_code" not in detail:
            detail["status_code"] = exc.status_code
        return detail
    return {"error": str(exc), "status_code": 500}


def _job_should_retry(exc: Exception) -> bool:
    if isinstance(exc, HTTPException):
        # 4xx are usually deterministic policy/input failures.
        return exc.status_code >= 500
    return True


def _retry_backoff_seconds(attempt: int) -> int:
    return PAYMENT_JOB_RETRY_BASE_SECONDS * (2 ** max(0, attempt - 1))


async def _enqueue_payment_job(*, job_key: str, payload: "ExecutePaymentRequest") -> dict:
    return await db.enqueue_payment_job(
        job_key=job_key,
        agent_id=payload.agent_id.strip(),
        recipient=payload.recipient,
        amount_usdc=float(payload.amount_usdc),
        max_attempts=PAYMENT_JOB_MAX_ATTEMPTS,
        next_retry_at=int(time.time()),
    )


def _response_from_payment_job(job: dict) -> dict:
    if job.get("status") == "succeeded":
        parsed = _json_loads_if_any(job.get("response_json"))
        if parsed is None:
            raise HTTPException(status_code=500, detail={"error": "Job marked succeeded but response is missing"})
        return parsed
    if job.get("status") == "dead_letter":
        detail = _json_loads_if_any(job.get("last_error")) or {"error": "Payment job failed permanently"}
        if isinstance(detail, dict) and isinstance(detail.get("error"), str):
            nested = _json_loads_if_any(detail["error"])
            if isinstance(nested, dict):
                detail = nested
        status_code = 500
        if isinstance(detail, dict):
            raw_status = detail.pop("status_code", None)
            if isinstance(raw_status, int) and 400 <= raw_status <= 599:
                status_code = raw_status
        else:
            detail = {"error": str(detail)}
        raise HTTPException(status_code=status_code, detail=detail)
    raise HTTPException(status_code=409, detail={"error": f"Job not in terminal state: {job.get('status')}"})


async def _wait_for_payment_job(job_key: str, timeout_seconds: int) -> dict:
    deadline = time.time() + timeout_seconds
    poll_seconds = PAYMENT_WORKER_POLL_MS / 1000
    while time.time() < deadline:
        job = await db.get_payment_job_by_key(job_key)
        if not job:
            raise HTTPException(status_code=500, detail={"error": "Queued payment job not found"})
        status = job.get("status")
        if status in {"succeeded", "dead_letter"}:
            return _response_from_payment_job(job)
        await asyncio.sleep(poll_seconds)

    raise HTTPException(
        status_code=504,
        detail={"error": "Payment job timed out", "job_key": job_key},
    )


def _is_nonce_issue(exc: Exception) -> bool:
    message = str(exc).lower()
    patterns = [
        "nonce too low",
        "already known",
        "replacement transaction underpriced",
        "nonce has already been used",
    ]
    return any(p in message for p in patterns)


async def _send_execute_payment_tx(
    *,
    agent_id_bytes: bytes,
    recipient_checksum: str,
    amount_units: int,
) -> tuple[str, dict]:
    if not w3 or not account:
        raise HTTPException(status_code=500, detail={"error": "Blockchain client is not configured"})

    global NONCE_CACHE
    for attempt in range(4):
        async with NONCE_LOCK:
            pending_nonce = await asyncio.to_thread(w3.eth.get_transaction_count, account.address, "pending")
            if NONCE_CACHE is None or NONCE_CACHE < pending_nonce:
                NONCE_CACHE = pending_nonce
            nonce = NONCE_CACHE

            gas_price = await asyncio.to_thread(lambda: w3.eth.gas_price)
            chain_id = await asyncio.to_thread(lambda: w3.eth.chain_id)
            tx = agent_vault.functions.executePayment(
                agent_id_bytes,
                recipient_checksum,
                amount_units,
            ).build_transaction(
                {
                    "from": account.address,
                    "nonce": nonce,
                    "gas": 300000,
                    "gasPrice": gas_price,
                    "chainId": chain_id,
                }
            )
            signed = account.sign_transaction(tx)
            try:
                tx_hash = await asyncio.to_thread(w3.eth.send_raw_transaction, signed.rawTransaction)
                NONCE_CACHE = nonce + 1
            except Exception as exc:
                if attempt < 3 and _is_nonce_issue(exc):
                    NONCE_CACHE = nonce + 1
                    continue
                raise HTTPException(status_code=500, detail={"error": f"Failed to submit transaction: {str(exc)}"})

        try:
            receipt = await asyncio.to_thread(w3.eth.wait_for_transaction_receipt, tx_hash, 180)
            return tx_hash.hex(), receipt
        except Exception as exc:
            if attempt < 3 and _is_nonce_issue(exc):
                NONCE_CACHE = nonce + 1
                continue
            raise HTTPException(status_code=500, detail={"error": f"Transaction confirmation failed: {str(exc)}"})

    raise HTTPException(status_code=500, detail={"error": "Unable to obtain a valid nonce for transaction after multiple attempts"})


async def _send_owner_tx(build_tx_fn) -> tuple[str, dict]:
    if not w3 or not account:
        raise HTTPException(status_code=500, detail={"error": "Blockchain client is not configured"})

    global NONCE_CACHE
    for attempt in range(4):
        async with NONCE_LOCK:
            pending_nonce = await asyncio.to_thread(w3.eth.get_transaction_count, account.address, "pending")
            if NONCE_CACHE is None or NONCE_CACHE < pending_nonce:
                NONCE_CACHE = pending_nonce
            nonce = NONCE_CACHE

            gas_price = await asyncio.to_thread(lambda: w3.eth.gas_price)
            chain_id = await asyncio.to_thread(lambda: w3.eth.chain_id)
            tx = build_tx_fn(nonce, gas_price, chain_id)
            signed = account.sign_transaction(tx)
            try:
                tx_hash = await asyncio.to_thread(w3.eth.send_raw_transaction, signed.rawTransaction)
                NONCE_CACHE = nonce + 1
            except Exception as exc:
                if attempt < 3 and _is_nonce_issue(exc):
                    NONCE_CACHE = nonce + 1
                    continue
                raise HTTPException(status_code=500, detail={"error": f"Failed to submit transaction: {str(exc)}"})

        try:
            receipt = await asyncio.to_thread(w3.eth.wait_for_transaction_receipt, tx_hash, 180)
            return tx_hash.hex(), receipt
        except Exception as exc:
            if attempt == 0 and _is_nonce_issue(exc):
                NONCE_CACHE = None
                continue
            raise HTTPException(status_code=500, detail={"error": f"Transaction confirmation failed: {str(exc)}"})

    raise HTTPException(status_code=500, detail={"error": "Unable to obtain a valid nonce for transaction"})


async def _payment_worker_loop() -> None:
    print("[payment-worker] started")
    while PAYMENT_WORKER_STOP_EVENT and not PAYMENT_WORKER_STOP_EVENT.is_set():
        job = await db.claim_next_payment_job(int(time.time()))
        if not job:
            await asyncio.sleep(PAYMENT_WORKER_POLL_MS / 1000)
            continue

        try:
            result = await _execute_payment_and_record(
                agent_id=job["agent_id"],
                recipient=job["recipient"],
                amount_usdc=float(job["amount_usdc"]),
            )
            await db.mark_payment_job_success(
                job_key=job["job_key"],
                tx_hash=result["tx_hash"],
                response_json=json.dumps(result, separators=(",", ":"), sort_keys=True),
            )
        except Exception as exc:
            attempts = int(job["attempts"])
            retryable = _job_should_retry(exc)
            if retryable and attempts < int(job["max_attempts"]):
                next_retry = int(time.time()) + _retry_backoff_seconds(attempts)
                await db.mark_payment_job_retry_or_dead(
                    job_key=job["job_key"],
                    status="retry",
                    next_retry_at=next_retry,
                    last_error=json.dumps(_job_error_payload(exc), separators=(",", ":"), sort_keys=True),
                )
            else:
                error_payload = _job_error_payload(exc)
                reason = error_payload.get("error", "Payment job failed permanently")
                if isinstance(reason, str) and reason.startswith("{") and "error" in reason:
                    try:
                        reason = json.loads(reason).get("error", reason)
                    except: pass

                await _insert_failed_transaction(
                    agent_id=job["agent_id"],
                    recipient=job["recipient"],
                    amount_usdc=float(job["amount_usdc"]),
                    block_reason=str(reason),
                    tx_hash=job.get("tx_hash"),
                )
                await db.mark_payment_job_retry_or_dead(
                    job_key=job["job_key"],
                    status="dead_letter",
                    next_retry_at=int(time.time()),
                    last_error=json.dumps(error_payload, separators=(",", ":"), sort_keys=True),
                )

    print("[payment-worker] stopped")


@app.on_event("startup")
async def on_startup():
    _validate_runtime_config()
    await db.init()
    global PAYMENT_WORKER_TASK, PAYMENT_WORKER_STOP_EVENT
    PAYMENT_WORKER_STOP_EVENT = asyncio.Event()
    if PAYMENT_WORKER_ENABLED:
        PAYMENT_WORKER_TASK = asyncio.create_task(_payment_worker_loop())


@app.on_event("shutdown")
async def on_shutdown():
    global PAYMENT_WORKER_TASK, PAYMENT_WORKER_STOP_EVENT
    if PAYMENT_WORKER_STOP_EVENT:
        PAYMENT_WORKER_STOP_EVENT.set()
    if PAYMENT_WORKER_TASK:
        PAYMENT_WORKER_TASK.cancel()
        try:
            await PAYMENT_WORKER_TASK
        except asyncio.CancelledError:
            pass
        except Exception:
            pass
        PAYMENT_WORKER_TASK = None


class Transaction(BaseModel):
    agent_id: str
    recipient: str
    amount_usdc: float
    tx_hash: str
    status: str
    block_reason: Optional[str] = None
    timestamp: int


class AgentExecuteRequest(BaseModel):
    task: str
    agent_id: Optional[str] = None


class ExecutePaymentRequest(BaseModel):
    agent_id: str = DEFAULT_AGENT_ID
    recipient: str
    amount_usdc: float
    reason: Optional[str] = None


class ExecuteDemoRequest(BaseModel):
    agent_id: str = DEFAULT_AGENT_ID
    recipient: str = DEFAULT_RECIPIENT
    amount_usdc: float = DEMO_EXECUTION_AMOUNT_USDC
    reason: Optional[str] = None
    actions: Optional[list[str]] = None
    weather_city: Optional[str] = None
    weather_lat: Optional[float] = None
    weather_lon: Optional[float] = None


def _resolve_agent_id(agent_id: Optional[str], header_agent_id: Optional[str]) -> str:
    resolved = (agent_id or header_agent_id or DEFAULT_AGENT_ID).strip()
    if not resolved:
        raise HTTPException(status_code=400, detail={"error": "agent_id is required"})
    return resolved


async def _ensure_agent_policy(agent_id: str) -> None:
    registry = get_policy_registry()
    if not registry:
        raise HTTPException(status_code=500, detail={"error": "PolicyRegistry is not configured"})

    agent_id_bytes = Web3.keccak(text=agent_id)
    try:
        policy = await asyncio.to_thread(registry.functions.getPolicy(agent_id_bytes).call)
    except Exception as exc:
        # Retry once using the policy registry address discovered from the vault.
        discovered = _discover_policy_registry_address()
        if discovered and discovered.lower() != POLICY_REGISTRY_ADDRESS.lower():
            print(
                "[policy] getPolicy failed. Switching PolicyRegistry from "
                f"{POLICY_REGISTRY_ADDRESS} to {discovered}."
            )
            globals()["POLICY_REGISTRY_ADDRESS"] = discovered
            registry = reset_policy_registry()
            if registry:
                try:
                    policy = await asyncio.to_thread(registry.functions.getPolicy(agent_id_bytes).call)
                except Exception as exc2:
                    raise HTTPException(status_code=500, detail={"error": f"Failed to fetch policy: {str(exc2)}"})
            else:
                raise HTTPException(status_code=500, detail={"error": "PolicyRegistry is not configured"})
        else:
            raise HTTPException(status_code=500, detail={"error": f"Failed to fetch policy: {str(exc)}"})

    # policy tuple: (maxPerTx, dailyCap, whitelist, isActive, registeredAt)
    registered_at = int(policy[4] or 0)
    is_active = bool(policy[3])

    if registered_at > 0:
        if not is_active:
            def _build_unpause_tx(nonce, gas_price, chain_id):
                return registry.functions.unpauseAgent(agent_id_bytes).build_transaction(
                    {
                        "from": account.address,
                        "nonce": nonce,
                        "gas": 200000,
                        "gasPrice": gas_price,
                        "chainId": chain_id,
                    }
                )
            await _send_owner_tx(_build_unpause_tx)
        return

    if not DEFAULT_RECIPIENT or DEFAULT_RECIPIENT == "0x0000000000000000000000000000000000000000":
        raise HTTPException(status_code=500, detail={"error": "DEFAULT_RECIPIENT is not configured"})

    max_units = int(round(DEFAULT_MAX_PER_TX_USDC * 10**6))
    daily_units = int(round(DEFAULT_DAILY_CAP_USDC * 10**6))

    def _build_register_tx(nonce, gas_price, chain_id):
        return registry.functions.registerAgent(
            agent_id_bytes,
            max_units,
            daily_units,
            [Web3.to_checksum_address(DEFAULT_RECIPIENT)],
        ).build_transaction(
            {
                "from": account.address,
                "nonce": nonce,
                "gas": 300000,
                "gasPrice": gas_price,
                "chainId": chain_id,
            }
        )

    await _send_owner_tx(_build_register_tx)


def _validate_payment_proof(
    tx_hash: str,
    *,
    expected_agent_id: str,
    expected_recipient: str,
    expected_amount_usdc: float,
) -> dict:
    if MOCK_MODE and tx_hash.startswith("0xMOCK_TX_"):
        normalized_hash = "0x" + hashlib.sha256(f"{expected_agent_id}:{tx_hash}".encode()).hexdigest()
        return {"tx_hash": normalized_hash, "block_number": 0, "gas_used": 0}

    if not tx_hash.startswith("0x") or len(tx_hash) != 66:
        raise HTTPException(status_code=402, detail={"error": "Invalid payment proof format"})

    if MOCK_MODE:
        raise HTTPException(status_code=402, detail={"error": "Mock mode only accepts mock payment proofs"})

    if not all([w3, agent_vault, AGENT_VAULT_ADDRESS]):
        raise HTTPException(status_code=500, detail={"error": "Payment verifier is not configured"})

    try:
        receipt = w3.eth.get_transaction_receipt(tx_hash)
    except Exception:
        raise HTTPException(status_code=402, detail={"error": "Payment transaction not found"})

    if receipt.get("status") != 1:
        raise HTTPException(status_code=402, detail={"error": "Payment transaction failed"})

    to_address = receipt.get("to")
    if not to_address or to_address.lower() != AGENT_VAULT_ADDRESS.lower():
        raise HTTPException(status_code=402, detail={"error": "Payment tx did not target SentinelVault"})

    try:
        events = agent_vault.events.PaymentExecuted().process_receipt(receipt)
    except Exception:
        raise HTTPException(status_code=402, detail={"error": "Unable to decode payment event"})

    expected_agent_id_bytes = Web3.keccak(text=expected_agent_id)
    expected_recipient_checksum = Web3.to_checksum_address(expected_recipient)
    expected_amount_units = int(round(expected_amount_usdc * 10**6))

    valid = False
    for event in events:
        args = event["args"]
        if (
            args["agentId"] == expected_agent_id_bytes
            and args["recipient"].lower() == expected_recipient_checksum.lower()
            and int(args["amount"]) == expected_amount_units
        ):
            valid = True
            break

    if not valid:
        raise HTTPException(status_code=402, detail={"error": "Payment proof does not match endpoint requirements"})

    return {
        "tx_hash": tx_hash,
        "block_number": int(receipt.get("blockNumber", 0) or 0),
        "gas_used": int(receipt.get("gasUsed", 0) or 0),
    }


async def _insert_paid_transaction(
    *,
    agent_id: str,
    recipient: str,
    amount_usdc: float,
    tx_hash: str,
    block_number: int,
    gas_used: int,
    timestamp: int | None = None,
):
    if await db.tx_hash_exists(tx_hash):
        raise HTTPException(status_code=409, detail={"error": "Payment proof has already been used"})

    payload = {
        "agent_id": agent_id,
        "recipient": recipient,
        "amount_usdc": amount_usdc,
        "tx_hash": tx_hash,
        "status": "success",
        "block_reason": None,
        "timestamp": int(timestamp or time.time()),
        "created_at": datetime.utcnow().isoformat(),
        "block_number": block_number,
        "gas_used": gas_used,
    }
    await db.insert_transaction(payload)


async def _insert_failed_transaction(
    *,
    agent_id: str,
    recipient: str,
    amount_usdc: float,
    block_reason: str,
    tx_hash: Optional[str] = None,
):
    # If no tx_hash (preflight failure), we generate a stable placeholder
    # based on the reason and time so it shows up as a unique "event" in the feed.
    if not tx_hash:
        tx_hash = f"failed-{hashlib.md5(f'{agent_id}:{block_reason}:{time.time()}'.encode()).hexdigest()[:16]}"

    payload = {
        "agent_id": agent_id,
        "recipient": recipient,
        "amount_usdc": amount_usdc,
        "tx_hash": tx_hash,
        "status": "failed",
        "block_reason": block_reason,
        "timestamp": int(time.time()),
        "created_at": datetime.utcnow().isoformat(),
        "block_number": 0,
        "gas_used": 0,
    }
    await db.insert_transaction(payload)


def _payment_required_detail(*, amount: float, recipient: str, description: str) -> dict:
    return {
        "error": "Payment Required",
        "amount": f"{amount:.3f}",
        "token": PAYMENT_TOKEN_SYMBOL,
        "token_address": PAYMENT_TOKEN_ADDRESS,
        "network": NETWORK_LABEL,
        "recipient": recipient,
        "description": description,
    }


def _tx_url(tx_hash: str) -> str:
    return f"{EXPLORER_TX_BASE_URL.rstrip('/')}/{tx_hash}"


def _demo_base_url() -> str:
    return (os.getenv("BACKEND_URL", "http://127.0.0.1:8000") or "http://127.0.0.1:8000").rstrip("/")


_WEATHER_CODE_MAP = {
    0: "Clear",
    1: "Mainly Clear",
    2: "Partly Cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing Rime Fog",
    51: "Light Drizzle",
    53: "Moderate Drizzle",
    55: "Dense Drizzle",
    56: "Light Freezing Drizzle",
    57: "Dense Freezing Drizzle",
    61: "Slight Rain",
    63: "Moderate Rain",
    65: "Heavy Rain",
    66: "Light Freezing Rain",
    67: "Heavy Freezing Rain",
    71: "Slight Snow",
    73: "Moderate Snow",
    75: "Heavy Snow",
    77: "Snow Grains",
    80: "Slight Rain Showers",
    81: "Moderate Rain Showers",
    82: "Violent Rain Showers",
    85: "Slight Snow Showers",
    86: "Heavy Snow Showers",
    95: "Thunderstorm",
    96: "Thunderstorm with Hail",
    99: "Thunderstorm with Heavy Hail",
}


def _weather_condition_from_code(code: Any) -> str:
    try:
        code_int = int(code)
    except Exception:
        return "Unknown"
    return _WEATHER_CODE_MAP.get(code_int, "Unknown")


async def _fetch_live_weather_data(*, city: Optional[str], lat: Optional[float], lon: Optional[float]) -> dict[str, Any]:
    resolved_city = (city or WEATHER_CITY or "Bangalore").strip()
    latitude = lat if lat is not None else WEATHER_LATITUDE
    longitude = lon if lon is not None else WEATHER_LONGITUDE

    async with httpx.AsyncClient(timeout=WEATHER_DATA_TIMEOUT_SECONDS) as client:
        if latitude is None or longitude is None:
            geo_response = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={
                    "name": resolved_city,
                    "count": 1,
                    "language": "en",
                    "format": "json",
                },
                headers={"accept": "application/json"},
            )
            geo_response.raise_for_status()
            geo_payload = geo_response.json()
            results = geo_payload.get("results") if isinstance(geo_payload, dict) else None
            if not results:
                raise RuntimeError(f"No geocoding results for '{resolved_city}'")
            top = results[0]
            latitude = top.get("latitude")
            longitude = top.get("longitude")
            name = top.get("name") or resolved_city
            country = top.get("country_code") or top.get("country")
            resolved_city = f"{name}, {country}" if country else name

        if latitude is None or longitude is None:
            raise RuntimeError("Missing latitude/longitude for weather lookup")

        # If we used device coordinates but no explicit city label, show the coords instead of a stale default city.
        if not city and lat is not None and lon is not None:
            resolved_city = f"Lat {latitude:.4f}, Lon {longitude:.4f}"

        weather_response = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": "temperature_2m,relative_humidity_2m,weather_code",
                "timezone": "auto",
            },
            headers={"accept": "application/json"},
        )
        weather_response.raise_for_status()
        weather_payload = weather_response.json()

    current = weather_payload.get("current") if isinstance(weather_payload, dict) else None
    if not current:
        raise RuntimeError("Live weather data missing current payload")

    temperature = current.get("temperature_2m")
    humidity = current.get("relative_humidity_2m")
    weather_code = current.get("weather_code")

    if temperature is None or humidity is None:
        raise RuntimeError("Live weather data missing temperature/humidity values")

    return {
        "city": resolved_city,
        "temperature": f"{temperature}C",
        "condition": _weather_condition_from_code(weather_code),
        "humidity": f"{humidity}%",
        "source": "open-meteo",
        "latitude": latitude,
        "longitude": longitude,
    }


async def _fetch_live_market_data() -> dict[str, Any]:
    url = (
        "https://api.coingecko.com/api/v3/simple/price"
        "?ids=bitcoin,ethereum,celo&vs_currencies=usd&include_24hr_change=true"
    )
    async with httpx.AsyncClient(timeout=MARKET_DATA_TIMEOUT_SECONDS) as client:
        response = await client.get(url, headers={"accept": "application/json"})
        response.raise_for_status()
        payload = response.json()

    bitcoin = payload.get("bitcoin", {}) if isinstance(payload, dict) else {}
    ethereum = payload.get("ethereum", {}) if isinstance(payload, dict) else {}
    celo = payload.get("celo", {}) if isinstance(payload, dict) else {}
    btc_price = bitcoin.get("usd")
    eth_price = ethereum.get("usd")
    celo_price = celo.get("usd")
    btc_change = bitcoin.get("usd_24h_change")
    eth_change = ethereum.get("usd_24h_change")
    celo_change = celo.get("usd_24h_change")

    if btc_price is None or eth_price is None or celo_price is None:
        raise RuntimeError("Live market data missing btc/eth/celo price values")

    trend = "unknown"
    if (
        isinstance(btc_change, (int, float))
        and isinstance(eth_change, (int, float))
        and isinstance(celo_change, (int, float))
    ):
        if btc_change >= 0 and eth_change >= 0 and celo_change >= 0:
            trend = "bullish"
        elif btc_change <= 0 and eth_change <= 0 and celo_change <= 0:
            trend = "bearish"
        else:
            trend = "mixed"

    return {
        "btc_price": str(btc_price),
        "eth_price": str(eth_price),
        "celo_price": str(celo_price),
        "trend": trend,
        "source": "coingecko",
    }


def _validated_amount_to_units(amount_usdc: float) -> int:
    if amount_usdc <= 0:
        raise HTTPException(status_code=400, detail={"error": "amount_usdc must be greater than 0"})
    amount_units = int(round(amount_usdc * 10**6))
    if amount_units <= 0:
        raise HTTPException(status_code=400, detail={"error": "amount_usdc is too small for token decimals"})
    return amount_units


def _build_vault_error_selector_map() -> dict[str, str]:
    if not agent_vault:
        return {}

    selector_map: dict[str, str] = {}
    for item in getattr(agent_vault, "abi", []) or []:
        if item.get("type") != "error":
            continue
        name = item.get("name")
        if not name:
            continue
        inputs = item.get("inputs", [])
        input_types: list[str] = []
        for arg in inputs:
            arg_type = arg.get("type") if isinstance(arg, dict) else None
            if not arg_type:
                input_types = []
                break
            input_types.append(arg_type)
        signature = f"{name}({','.join(input_types)})"
        selector_hex = Web3.keccak(text=signature)[:4].hex()
        if selector_hex.startswith("0x"):
            selector_hex = selector_hex[2:]
        selector = "0x" + selector_hex
        selector_map[selector.lower()] = name
    return selector_map


_VAULT_ERROR_SELECTOR_MAP = _build_vault_error_selector_map()
_VAULT_ERROR_HINTS = {
    "InvalidAddress": "Invalid recipient address.",
    "ZeroAmount": "Amount must be greater than zero.",
    "AgentNotActive": "Agent policy is inactive. Activate policy before execution.",
    "RecipientNotWhitelisted": "Recipient is not whitelisted in policy.",
    "ExceedsPerTxLimit": "Amount exceeds per-transaction policy limit.",
    "ExceedsDailyCap": "Amount exceeds daily cap for this agent.",
    "InsufficientBalance": "Insufficient vault balance for this agent. Fund SentinelVault and retry.",
}


def _extract_revert_selector(exc: Exception) -> Optional[str]:
    values: list[str] = [str(exc)]
    for arg in getattr(exc, "args", ()) or ():
        if isinstance(arg, str):
            values.append(arg)

    for value in values:
        text = value.strip()
        if text.startswith("0x") and len(text) >= 10:
            return text[:10].lower()
        match = re.search(r"0x[0-9a-fA-F]{8}", text)
        if match:
            return match.group(0).lower()
    return None


def _format_execute_payment_revert(exc: Exception) -> str:
    selector = _extract_revert_selector(exc)
    if selector:
        error_name = _VAULT_ERROR_SELECTOR_MAP.get(selector)
        if error_name:
            return _VAULT_ERROR_HINTS.get(error_name, f"Contract reverted with {error_name}.")
    text = str(exc).strip()
    if text:
        return f"Contract reverted: {text}"
    return "Contract reverted"


async def _preflight_execute_payment(
    *,
    agent_id_bytes: bytes,
    recipient_checksum: str,
    amount_units: int,
) -> Optional[str]:
    try:
        await asyncio.to_thread(
            lambda: agent_vault.functions.executePayment(
                agent_id_bytes,
                recipient_checksum,
                amount_units,
            ).call({"from": account.address})
        )
        return None
    except Exception as exc:
        return _format_execute_payment_revert(exc)


async def _execute_payment_and_record(*, agent_id: str, recipient: str, amount_usdc: float) -> dict:
    if MOCK_MODE:
        raise HTTPException(status_code=400, detail={"error": "Payment execution is disabled in MOCK_MODE"})
    if not w3 or not agent_vault or not account:
        raise HTTPException(status_code=500, detail={"error": "Blockchain client is not configured"})

    normalized_agent_id = agent_id.strip()
    if not normalized_agent_id:
        raise HTTPException(status_code=400, detail={"error": "agent_id is required"})

    try:
        recipient_checksum = Web3.to_checksum_address(recipient)
    except Exception:
        raise HTTPException(status_code=400, detail={"error": "Invalid recipient address"})

    amount_units = _validated_amount_to_units(amount_usdc)
    agent_id_bytes = Web3.keccak(text=normalized_agent_id)

    # Preflight eth_call to surface deterministic contract revert reasons
    # before spending gas on a failing transaction.
    preflight_error = await _preflight_execute_payment(
        agent_id_bytes=agent_id_bytes,
        recipient_checksum=recipient_checksum,
        amount_units=amount_units,
    )
    if preflight_error:
        await _insert_failed_transaction(
            agent_id=normalized_agent_id,
            recipient=recipient_checksum,
            amount_usdc=amount_usdc,
            block_reason=preflight_error,
        )
        raise HTTPException(
            status_code=400,
            detail={"error": preflight_error},
        )

    tx_hash_hex, receipt = await _send_execute_payment_tx(
        agent_id_bytes=agent_id_bytes,
        recipient_checksum=recipient_checksum,
        amount_units=amount_units,
    )
    if int(receipt.get("status", 0) or 0) != 1:
        post_revert_error = await _preflight_execute_payment(
            agent_id_bytes=agent_id_bytes,
            recipient_checksum=recipient_checksum,
            amount_units=amount_units,
        )
        reason = post_revert_error or "Payment transaction reverted on-chain"
        await _insert_failed_transaction(
            agent_id=normalized_agent_id,
            recipient=recipient_checksum,
            amount_usdc=amount_usdc,
            tx_hash=tx_hash_hex,
            block_reason=reason,
        )
        raise HTTPException(
            status_code=400,
            detail={"error": reason},
        )

    events = agent_vault.events.PaymentExecuted().process_receipt(receipt)
    if not events:
        raise HTTPException(status_code=500, detail={"error": "PaymentExecuted event not found"})

    event_match = None
    for event in events:
        args = event["args"]
        if (
            args["agentId"] == agent_id_bytes
            and args["recipient"].lower() == recipient_checksum.lower()
            and int(args["amount"]) == amount_units
        ):
            event_match = args
            break

    if event_match is None:
        raise HTTPException(status_code=500, detail={"error": "PaymentExecuted event does not match request"})

    block_number = int(receipt.get("blockNumber", 0) or 0)
    gas_used = int(receipt.get("gasUsed", 0) or 0)
    timestamp = int(time.time())
    if block_number:
        try:
            timestamp = int((await asyncio.to_thread(w3.eth.get_block, block_number)).get("timestamp", timestamp))
        except Exception:
            pass

    await _insert_paid_transaction(
        agent_id=normalized_agent_id,
        recipient=event_match["recipient"],
        amount_usdc=int(event_match["amount"]) / 10**6,
        tx_hash=tx_hash_hex,
        block_number=block_number,
        gas_used=gas_used,
        timestamp=timestamp,
    )

    return {
        "tx_hash": tx_hash_hex,
        "tx_url": _tx_url(tx_hash_hex),
        "agent_id": normalized_agent_id,
        "recipient": recipient_checksum,
        "amount_usdc": amount_usdc,
        "chain_id": int(await asyncio.to_thread(lambda: w3.eth.chain_id)),
    }


@app.get("/api/weather")
async def get_weather(
    x_payment_proof: Optional[str] = Header(None),
    agent_id: Optional[str] = None,
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-Id"),
    city: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
):
    recipient = DEFAULT_RECIPIENT
    amount = WEATHER_PRICE_USDC
    agent_id = _resolve_agent_id(agent_id, x_agent_id)
    await _ensure_agent_policy(agent_id)

    if not x_payment_proof:
        raise HTTPException(
            status_code=402,
            detail=_payment_required_detail(
                amount=amount,
                recipient=recipient,
                description="Weather API - per request fee",
            ),
        )

    verification = _validate_payment_proof(
        x_payment_proof,
        expected_agent_id=agent_id,
        expected_recipient=recipient,
        expected_amount_usdc=amount,
    )
    await _insert_paid_transaction(
        agent_id=agent_id,
        recipient=recipient,
        amount_usdc=amount,
        tx_hash=verification["tx_hash"],
        block_number=verification["block_number"],
        gas_used=verification["gas_used"],
    )

    weather_payload: dict[str, Any] | None = None
    if LIVE_WEATHER_DATA:
        try:
            weather_payload = await _fetch_live_weather_data(city=city, lat=lat, lon=lon)
        except Exception as exc:
            print(f"[weather] live data fetch failed: {exc}")

    if not weather_payload:
        weather_payload = {
            "city": WEATHER_CITY,
            "temperature": "28C",
            "condition": "Partly Cloudy",
            "humidity": "65%",
            "source": "stub",
        }

    LAST_WEATHER_SNAPSHOT_BY_AGENT[agent_id] = {**weather_payload}
    LAST_WEATHER_CAPTURED_AT_BY_AGENT[agent_id] = time.time()

    return {
        **weather_payload,
        "paid": True,
        "payment_proof": x_payment_proof,
    }


@app.get("/api/data-feed")
async def get_data_feed(
    x_payment_proof: Optional[str] = Header(None),
    agent_id: Optional[str] = None,
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-Id"),
):
    recipient = DEFAULT_RECIPIENT
    amount = DATA_FEED_PRICE_USDC
    agent_id = _resolve_agent_id(agent_id, x_agent_id)
    await _ensure_agent_policy(agent_id)

    if not x_payment_proof:
        raise HTTPException(
            status_code=402,
            detail=_payment_required_detail(
                amount=amount,
                recipient=recipient,
                description="Data feed API",
            ),
        )

    verification = _validate_payment_proof(
        x_payment_proof,
        expected_agent_id=agent_id,
        expected_recipient=recipient,
        expected_amount_usdc=amount,
    )
    await _insert_paid_transaction(
        agent_id=agent_id,
        recipient=recipient,
        amount_usdc=amount,
        tx_hash=verification["tx_hash"],
        block_number=verification["block_number"],
        gas_used=verification["gas_used"],
    )

    market_payload: dict[str, Any] | None = None
    if LIVE_MARKET_DATA:
        try:
            market_payload = await _fetch_live_market_data()
        except Exception as exc:
            print(f"[market] live data fetch failed: {exc}")

    if not market_payload:
        market_payload = {
            "btc_price": "45000",
            "eth_price": "2800",
            "celo_price": "0.70",
            "trend": "bullish",
            "source": "stub",
        }

    LAST_MARKET_SNAPSHOT_BY_AGENT[agent_id] = {"market": "crypto", **market_payload}
    LAST_MARKET_CAPTURED_AT_BY_AGENT[agent_id] = time.time()

    return {
        "market": "crypto",
        **market_payload,
        "paid": True,
        "payment_proof": x_payment_proof,
    }


@app.get("/transactions")
async def get_transactions(agent_id: Optional[str] = None):
    rows = await db.fetch_transactions(limit=50, agent_id=agent_id)
    data = []
    for tx in rows:
        tx["tx_url"] = _tx_url(tx["tx_hash"])
        data.append(tx)
    return {"transactions": data}


@app.get("/transactions/onchain")
async def get_onchain_transactions():
    return await get_transactions()


@app.get("/executions")
async def get_executions(agent_id: Optional[str] = None):
    rows = await db.fetch_transactions(limit=50, agent_id=agent_id)
    data = []
    for tx in rows:
        tx["tx_url"] = _tx_url(tx["tx_hash"])
        data.append(tx)
    return {"executions": data}


@app.get("/weather-snapshot")
async def get_weather_snapshot(
    agent_id: Optional[str] = None,
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-Id"),
):
    resolved_agent_id = _resolve_agent_id(agent_id, x_agent_id)
    snapshot = LAST_WEATHER_SNAPSHOT_BY_AGENT.get(resolved_agent_id)
    if not snapshot:
        return {"available": False, "message": "No paid weather data yet"}
    captured_at = None
    age_seconds = None
    captured = LAST_WEATHER_CAPTURED_AT_BY_AGENT.get(resolved_agent_id)
    if captured:
        captured_at = datetime.utcfromtimestamp(captured).isoformat() + "Z"
        age_seconds = max(0, int(time.time() - captured))
    return {
        "available": True,
        "snapshot": snapshot,
        "captured_at": captured_at,
        "age_seconds": age_seconds,
    }


@app.get("/market-snapshot")
async def get_market_snapshot(
    agent_id: Optional[str] = None,
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-Id"),
):
    resolved_agent_id = _resolve_agent_id(agent_id, x_agent_id)
    snapshot = LAST_MARKET_SNAPSHOT_BY_AGENT.get(resolved_agent_id)
    if not snapshot:
        return {"available": False, "message": "No paid market data yet"}
    captured_at = None
    age_seconds = None
    captured = LAST_MARKET_CAPTURED_AT_BY_AGENT.get(resolved_agent_id)
    if captured:
        captured_at = datetime.utcfromtimestamp(captured).isoformat() + "Z"
        age_seconds = max(0, int(time.time() - captured))
    return {
        "available": True,
        "snapshot": snapshot,
        "captured_at": captured_at,
        "age_seconds": age_seconds,
    }


@app.get("/payment-jobs")
async def get_payment_jobs(status: Optional[str] = None, limit: int = 50):
    if limit <= 0:
        raise HTTPException(status_code=400, detail={"error": "limit must be greater than 0"})
    if limit > 200:
        limit = 200
    rows = await db.fetch_payment_jobs(status=status, limit=limit)
    data = []
    for job in rows:
        if job.get("tx_hash"):
            job["tx_url"] = _tx_url(job["tx_hash"])
        data.append(job)
    return {"payment_jobs": data}


@app.get("/payment-jobs/{job_key}")
async def get_payment_job(job_key: str):
    job = await db.get_payment_job_by_key(job_key)
    if not job:
        raise HTTPException(status_code=404, detail={"error": "Payment job not found"})
    if job.get("tx_hash"):
        job["tx_url"] = _tx_url(job["tx_hash"])
    return job


@app.get("/vault-balance")
async def get_vault_balance(
    agent_id: Optional[str] = None,
    x_agent_id: Optional[str] = Header(None, alias="X-Agent-Id"),
):
    print("[vault-balance] start")
    if MOCK_MODE:
        raise HTTPException(status_code=400, detail={"error": "Vault balance is unavailable in MOCK_MODE"})
    if not w3 or not agent_vault:
        raise HTTPException(status_code=500, detail={"error": "Blockchain client is not configured"})

    resolved_agent_id = _resolve_agent_id(agent_id, x_agent_id)
    agent_id_bytes = Web3.keccak(text=resolved_agent_id)
    try:
        balance_units = agent_vault.functions.getBalance(agent_id_bytes).call()
        balance_usdc = balance_units / 10**6
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": f"Failed to fetch vault balance: {str(e)}"})

    print(f"[vault-balance] balance_usdc={balance_usdc:.2f}")
    return {"balance_usdc": f"{balance_usdc:.2f}"}


@app.get("/network-info")
async def get_network_info():
    print("[network-info] start")
    payload = {
        "chain": NETWORK_NAME,
        "chain_id": int(w3.eth.chain_id) if w3 else CHAIN_ID,
        "why_celo": NETWORK_RATIONALE,
    }
    print("[network-info] done")
    return payload


@app.post("/execute-payment")
async def execute_payment(
    payload: ExecutePaymentRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    _: None = Depends(require_operator_access),
    __: None = Depends(require_agent_signature),
):
    print(
        f"[execute-payment] start agent_id={payload.agent_id} "
        f"recipient={payload.recipient} amount={payload.amount_usdc}"
    )
    async def _action():
        normalized_payload = ExecutePaymentRequest(
            agent_id=payload.agent_id.strip(),
            recipient=payload.recipient,
            amount_usdc=payload.amount_usdc,
            reason=payload.reason,
        )
        if not normalized_payload.agent_id:
            raise HTTPException(status_code=400, detail={"error": "agent_id is required"})

        if not PAYMENT_WORKER_ENABLED:
            return await _execute_payment_and_record(
                agent_id=normalized_payload.agent_id,
                recipient=normalized_payload.recipient,
                amount_usdc=normalized_payload.amount_usdc,
            )

        if not PAYMENT_WORKER_TASK:
            raise HTTPException(status_code=500, detail={"error": "Payment worker is not running"})

        effective_job_key = idempotency_key or (
            "job_" + hashlib.sha256(f"{time.time_ns()}:{normalized_payload.model_dump()}".encode()).hexdigest()[:24]
        )
        await _enqueue_payment_job(job_key=effective_job_key, payload=normalized_payload)
        return await _wait_for_payment_job(effective_job_key, PAYMENT_JOB_WAIT_TIMEOUT_SECONDS)

    result = await _run_idempotent(
        key=idempotency_key,
        endpoint="/execute-payment",
        payload=payload.model_dump(),
        action=_action,
    )
    print(f"[execute-payment] done tx_hash={result['tx_hash']}")
    return result


@app.post("/execute-demo")
async def execute_demo(
    payload: Optional[ExecuteDemoRequest] = None,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    _: None = Depends(require_operator_access),
    __: None = Depends(require_agent_signature),
    ___: None = Depends(require_wallet_signature),
):
    try:
        effective = payload or ExecuteDemoRequest()
        print("[execute-demo] start")
        print(f"[execute-demo] connecting to RPC: {ALCHEMY_RPC}")
        print(f"[execute-demo] contract address: {AGENT_VAULT_ADDRESS}")
        print(f"[execute-demo] signer address: {account.address if account else 'n/a'}")

        agent_id_value = effective.agent_id.strip()
        if not agent_id_value:
            raise HTTPException(status_code=400, detail={"error": "agent_id is required"})
        await _ensure_agent_policy(agent_id_value)

        requested_actions = [item.lower().strip() for item in (effective.actions or []) if item]
        if effective.actions is not None:
            allowed_actions = {"weather", "market"}
            selected_actions = [item for item in requested_actions if item in allowed_actions]
            if not selected_actions:
                raise HTTPException(status_code=400, detail={"error": "No valid demo actions provided"})

            async def _action():
                demo_results = []
                base_url = _demo_base_url()
                weather_params: dict[str, Any] = {"agent_id": agent_id_value}
                if isinstance(effective.weather_city, str) and effective.weather_city.strip():
                    weather_params["city"] = effective.weather_city.strip()
                if effective.weather_lat is not None:
                    weather_params["lat"] = effective.weather_lat
                if effective.weather_lon is not None:
                    weather_params["lon"] = effective.weather_lon
                for action in selected_actions:
                    if action == "weather":
                        endpoint = f"{base_url}/api/weather"
                        if weather_params:
                            endpoint = f"{endpoint}?{urlencode(weather_params)}"
                    else:
                        endpoint = f"{base_url}/api/data-feed?{urlencode({'agent_id': agent_id_value})}"
                    try:
                        result = await call_paid_endpoint(
                            agent_id=agent_id_value,
                            endpoint=endpoint,
                            extra_headers={"X-Agent-Id": agent_id_value},
                        )
                    except Exception as exc:
                        raise HTTPException(status_code=400, detail={"error": str(exc)})
                    tx_hash = result.get("payment_proof")
                    demo_results.append(
                        {
                            "name": action,
                            "result": result,
                            "tx_hash": tx_hash,
                            "tx_url": _tx_url(tx_hash) if isinstance(tx_hash, str) and tx_hash else None,
                        }
                    )
                return {
                    "mode": "actions",
                    "agent_id": agent_id_value,
                    "actions": demo_results,
                }

            return await _run_idempotent(
                key=idempotency_key,
                endpoint="/execute-demo",
                payload={
                    "agent_id": agent_id_value,
                    "actions": selected_actions,
                    "weather_city": effective.weather_city,
                    "weather_lat": effective.weather_lat,
                    "weather_lon": effective.weather_lon,
                },
                action=_action,
            )

        async def _action():
            normalized_payload = ExecutePaymentRequest(
                agent_id=effective.agent_id.strip(),
                recipient=effective.recipient,
                amount_usdc=effective.amount_usdc,
                reason=effective.reason,
            )
            if not normalized_payload.agent_id:
                raise HTTPException(status_code=400, detail={"error": "agent_id is required"})

            if not PAYMENT_WORKER_ENABLED:
                return await _execute_payment_and_record(
                    agent_id=normalized_payload.agent_id,
                    recipient=normalized_payload.recipient,
                    amount_usdc=normalized_payload.amount_usdc,
                )

            if not PAYMENT_WORKER_TASK:
                raise HTTPException(status_code=500, detail={"error": "Payment worker is not running"})

            effective_job_key = idempotency_key or (
                "job_" + hashlib.sha256(f"{time.time_ns()}:{normalized_payload.model_dump()}".encode()).hexdigest()[:24]
            )
            await _enqueue_payment_job(job_key=effective_job_key, payload=normalized_payload)
            return await _wait_for_payment_job(effective_job_key, PAYMENT_JOB_WAIT_TIMEOUT_SECONDS)

        result = await _run_idempotent(
            key=idempotency_key,
            endpoint="/execute-demo",
            payload=effective.model_dump(),
            action=_action,
        )
        print("[execute-demo] db_insert=success")
        latest = await db.fetch_transactions(limit=1)
        print(f"[execute-demo] latest_row={latest}")

        return result
    except Exception as e:
        print(f"[execute-demo] ERROR: {e}")
        print(traceback.format_exc())
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agent-execute")
async def agent_execute(
    payload: AgentExecuteRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    _: None = Depends(require_operator_access),
    __: None = Depends(require_agent_signature),
):
    print("[agent-execute] start")
    if not payload.task.strip():
        raise HTTPException(status_code=400, detail={"error": "Task is required"})
    resolved_agent_id = _resolve_agent_id(payload.agent_id, None)
    await _ensure_agent_policy(resolved_agent_id)

    async def _action():
        try:
            agent = DemoAgent()
            return await asyncio.to_thread(agent.run, payload.task, resolved_agent_id)
        except Exception as e:
            raise HTTPException(status_code=500, detail={"error": f"Agent execution failed: {str(e)}"})

    result = await _run_idempotent(
        key=idempotency_key,
        endpoint="/agent-execute",
        payload=payload.model_dump(),
        action=_action,
    )

    print(f"[agent-execute] done tx_hash={result.get('tx_hash')}")
    return result


@app.post("/transactions")
async def create_transaction(
    transaction: Transaction,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    _: None = Depends(require_operator_access),
):
    block_number = 0
    gas_used = 0

    if transaction.tx_hash.startswith("0x") and len(transaction.tx_hash) == 66 and not MOCK_MODE and w3:
        try:
            receipt = w3.eth.get_transaction_receipt(transaction.tx_hash)
            block_number = int(receipt.get("blockNumber", 0) or 0)
            gas_used = int(receipt.get("gasUsed", 0) or 0)
        except Exception:
            pass

    payload = {
        "agent_id": transaction.agent_id,
        "recipient": transaction.recipient,
        "amount_usdc": transaction.amount_usdc,
        "tx_hash": transaction.tx_hash,
        "status": transaction.status,
        "block_reason": transaction.block_reason,
        "timestamp": transaction.timestamp,
        "created_at": datetime.utcnow().isoformat(),
        "block_number": block_number,
        "gas_used": gas_used,
    }

    async def _action():
        transaction_id = await db.insert_transaction(payload)
        return {
            "id": transaction_id,
            "message": "Transaction saved successfully",
            **transaction.model_dump(),
        }

    return await _run_idempotent(
        key=idempotency_key,
        endpoint="/transactions",
        payload=transaction.model_dump(),
        action=_action,
    )


@app.get("/debug/db-status")
async def db_status():
    if db.backend == "sqlite":
        conn = sqlite3.connect(db.sqlite_path)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM transactions")
        row_count = int(cur.fetchone()[0])
        cur.execute("SELECT COUNT(*) FROM idempotency_keys")
        idempotency_count = int(cur.fetchone()[0])
        cur.execute("SELECT COUNT(*) FROM payment_jobs")
        payment_job_count = int(cur.fetchone()[0])
        cur.execute("SELECT COUNT(*) FROM payment_jobs WHERE status = 'dead_letter'")
        dead_letter_count = int(cur.fetchone()[0])
        cur.execute("PRAGMA table_info(transactions)")
        columns = [
            {
                "name": r[1],
                "type": r[2],
                "notnull": bool(r[3]),
                "default": r[4],
            }
            for r in cur.fetchall()
        ]
        conn.close()
        return {
            "backend": "sqlite",
            "row_count": row_count,
            "idempotency_count": idempotency_count,
            "payment_job_count": payment_job_count,
            "dead_letter_count": dead_letter_count,
            "columns": columns,
        }

    async with db.pg_pool.acquire() as conn:
        row_count = await conn.fetchval("SELECT COUNT(*) FROM transactions")
        idempotency_count = await conn.fetchval("SELECT COUNT(*) FROM idempotency_keys")
        payment_job_count = await conn.fetchval("SELECT COUNT(*) FROM payment_jobs")
        dead_letter_count = await conn.fetchval("SELECT COUNT(*) FROM payment_jobs WHERE status = 'dead_letter'")
        cols = await conn.fetch(
            """
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'transactions'
            ORDER BY ordinal_position
            """
        )
        columns = [
            {
                "name": c["column_name"],
                "type": c["data_type"],
                "notnull": c["is_nullable"] == "NO",
                "default": c["column_default"],
            }
            for c in cols
        ]
        return {
            "backend": "postgres",
            "row_count": int(row_count),
            "idempotency_count": int(idempotency_count),
            "payment_job_count": int(payment_job_count),
            "dead_letter_count": int(dead_letter_count),
            "columns": columns,
        }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "network": NETWORK_LABEL,
        "database": db.backend if db else "unknown",
        "mock_mode": MOCK_MODE,
        "vault_address": AGENT_VAULT_ADDRESS,
        "policy_registry": POLICY_REGISTRY_ADDRESS,
        "rpc_url_masked": f"{ALCHEMY_RPC[:20]}..." if ALCHEMY_RPC else None,
        "operator_auth_required": REQUIRE_OPERATOR_AUTH,
        "idempotency_key_required": REQUIRE_IDEMPOTENCY_KEY,
        "agent_signature_required": REQUIRE_AGENT_SIGNATURE,
        "wallet_signature_required": REQUIRE_WALLET_SIGNATURE,
        "payment_worker_enabled": PAYMENT_WORKER_ENABLED,
        "payment_worker_running": PAYMENT_WORKER_TASK is not None,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
