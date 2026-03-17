"""
Safe one-way migration: SQLite -> Postgres

Usage:
  DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db python3 backend/scripts/migrate_sqlite_to_postgres.py

Optional:
  SQLITE_DB_PATH=backend/db/transactions.db
"""

import os
import asyncio
import sqlite3
import asyncpg

SQLITE_DB_PATH = os.getenv("SQLITE_DB_PATH", "backend/db/transactions.db")
DATABASE_URL = os.getenv("DATABASE_URL", "")

CREATE_TABLE_SQL = """
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
);
"""

INSERT_SQL = """
INSERT INTO transactions (
    id, agent_id, recipient, amount_usdc, tx_hash, status, block_reason,
    timestamp, created_at, block_number, gas_used
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
ON CONFLICT (tx_hash) DO NOTHING;
"""


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def _read_sqlite_rows(path: str):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT id, agent_id, recipient, amount_usdc, tx_hash, status, block_reason,
               timestamp, created_at,
               COALESCE(block_number, 0) AS block_number,
               COALESCE(gas_used, 0) AS gas_used
        FROM transactions
        ORDER BY id ASC
    """)
    rows = cur.fetchall()
    conn.close()
    return rows


async def main():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required and must point to Postgres")

    db_url = _normalize_database_url(DATABASE_URL)
    if not db_url.startswith("postgresql://"):
        raise RuntimeError("DATABASE_URL must be a Postgres URL")

    if not os.path.exists(SQLITE_DB_PATH):
        raise RuntimeError(f"SQLite DB not found at {SQLITE_DB_PATH}")

    rows = _read_sqlite_rows(SQLITE_DB_PATH)
    print(f"Found {len(rows)} rows in SQLite")

    conn = await asyncpg.connect(db_url)
    try:
        await conn.execute(CREATE_TABLE_SQL)

        inserted = 0
        for r in rows:
            result = await conn.execute(
                INSERT_SQL,
                r["id"],
                r["agent_id"],
                r["recipient"],
                float(r["amount_usdc"]),
                r["tx_hash"],
                r["status"],
                r["block_reason"],
                int(r["timestamp"]),
                r["created_at"],
                int(r["block_number"]),
                int(r["gas_used"]),
            )
            if result.endswith("1"):
                inserted += 1

        print(f"Inserted {inserted} rows into Postgres (duplicates skipped)")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
