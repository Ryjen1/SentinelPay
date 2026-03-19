"""
SentinelPay Client SDK
Implements on-chain payment execution flow for AI agents on Celo
"""

import os
import json
import asyncio
import time
from pathlib import Path
from web3 import Web3
import re
from eth_account import Account
import httpx
from dotenv import load_dotenv

# Load environment variables from backend/.env first, then root .env as fallback.
# On Vercel, we prioritize the project environment variables.
is_vercel = os.getenv("VERCEL") == "1"
backend_env_path = Path(__file__).resolve().parent.parent / ".env"
root_env_path = Path(__file__).resolve().parent.parent.parent / ".env"

if not is_vercel:
    load_dotenv(dotenv_path=backend_env_path, override=False)
    load_dotenv(dotenv_path=root_env_path, override=False)

# Environment variables
ALCHEMY_RPC = os.getenv("CELO_RPC") or os.getenv("ALCHEMY_RPC")
PRIVATE_KEY = os.getenv("PRIVATE_KEY")
AGENT_VAULT_ADDRESS = os.getenv("AGENT_VAULT_ADDRESS")
USDC_ADDRESS = os.getenv("USDC_ADDRESS") or os.getenv("PAYMENT_TOKEN_ADDRESS")
# Backend URL for internal SDK calls (should be the public URL on Vercel)
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
NETWORK_NAME = os.getenv("NETWORK_NAME", "Celo Sepolia")
CHAIN_ID = int(os.getenv("CHAIN_ID", "11142220"))

# Mock mode flag
MOCK_MODE = os.getenv("MOCK_PAYMENT", "false").lower() == "true"

# Global instances (initialized on first use or lazily)
w3 = None
account = None
agent_vault = None

_VAULT_ERROR_SELECTOR_MAP = None
_VAULT_ERROR_HINTS = {
    "AgentNotActive": "Agent policy is inactive. Activate policy before execution.",
    "RecipientNotWhitelisted": "Recipient is not whitelisted in policy.",
    "ExceedsPerTxLimit": "Amount exceeds per-transaction policy limit.",
    "ExceedsDailyCap": "Amount exceeds daily cap for this agent.",
    "InsufficientBalance": "Insufficient vault balance for this agent.",
}

def get_w3():
    global w3
    if w3 is None and not MOCK_MODE:
        if not ALCHEMY_RPC:
            print("[get_w3] ERROR: CELO_RPC not set")
            return None
        print(f"[get_w3] Initializing Web3 with RPC: {ALCHEMY_RPC[:20]}...")
        # Add a 30-second timeout for better resilience in serverless environments
        w3 = Web3(Web3.HTTPProvider(ALCHEMY_RPC, request_kwargs={'timeout': 30}))
    return w3

def get_account():
    global account
    if account is None and not MOCK_MODE:
        if not PRIVATE_KEY:
            print("[error] PRIVATE_KEY not set")
            return None
        try:
            account = Account.from_key(PRIVATE_KEY)
        except Exception as e:
            print(f"[error] Failed to load account: {e}")
            return None
    return account

def get_vault():
    global agent_vault
    _w3 = get_w3()
    if agent_vault is None and _w3 and not MOCK_MODE:
        if not AGENT_VAULT_ADDRESS:
            print("[error] AGENT_VAULT_ADDRESS not set")
            return None
        
        abi_candidates = [
            Path(__file__).parent / "abi" / "SentinelVault.json",
            Path(__file__).parent / "abi" / "AgentVault.json",
        ]
        abi_path = next((p for p in abi_candidates if p.exists()), None)
        if not abi_path:
            print("[error] ABI not found")
            return None
            
        try:
            with open(abi_path, "r") as f:
                contract_json = json.load(f)
                abi = contract_json["abi"]
            agent_vault = _w3.eth.contract(
                address=Web3.to_checksum_address(AGENT_VAULT_ADDRESS),
                abi=abi,
            )
        except Exception as e:
            print(f"[error] Failed to init vault: {e}")
            return None
    return agent_vault


def _build_vault_error_selector_map() -> dict[str, str]:
    global _VAULT_ERROR_SELECTOR_MAP
    if _VAULT_ERROR_SELECTOR_MAP is not None:
        return _VAULT_ERROR_SELECTOR_MAP
    _vault = get_vault()
    if not _vault:
        _VAULT_ERROR_SELECTOR_MAP = {}
        return _VAULT_ERROR_SELECTOR_MAP
    selector_map: dict[str, str] = {}
    for item in getattr(_vault, "abi", []) or []:
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
    _VAULT_ERROR_SELECTOR_MAP = selector_map
    return selector_map


def _extract_revert_selector(exc: Exception) -> str | None:
    values = [str(exc)]
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
        selector_map = _build_vault_error_selector_map()
        error_name = selector_map.get(selector)
        if error_name:
            return _VAULT_ERROR_HINTS.get(error_name, f"Contract reverted with {error_name}.")
    text = str(exc).strip()
    if text:
        return f"Contract reverted: {text}"
    return "Contract reverted"

# Initial check for logging
if MOCK_MODE:
    print("[✓] Running in MOCK MODE")
else:
    if not all([ALCHEMY_RPC, PRIVATE_KEY, AGENT_VAULT_ADDRESS, USDC_ADDRESS]):
        print("[!] Warning: Missing required environment variables for on-chain payments")


async def call_paid_endpoint(agent_id: str, endpoint: str, *, extra_headers: dict | None = None) -> dict:
    """
    Call a paid API endpoint with automatic on-chain payment execution
    """
    _w3 = get_w3()
    _account = get_account()
    _vault = get_vault()

    async with httpx.AsyncClient(timeout=60.0) as client:
        base_headers = extra_headers or {}
        print("[1] Calling endpoint")
        response = await client.get(endpoint, headers=base_headers)

        if response.status_code != 402:
            return response.json()

        print("[2] 402 detected")
        payment_info = response.json()

        if "detail" in payment_info:
            payment_info = payment_info["detail"]

        amount = float(payment_info["amount"])
        recipient = payment_info["recipient"]

        print("[3] Executing payment")

        if MOCK_MODE:
            tx_hash_hex = f"0xMOCK_TX_{int(time.time() * 1000)}"
        else:
            if not all([_w3, _account, _vault]):
                raise Exception("Missing blockchain configuration (RPC, Private Key, or Vault Address)")
                
            agent_id_bytes = Web3.keccak(text=agent_id)
            amount_units = int(round(amount * 10**6))
            recipient_address = Web3.to_checksum_address(recipient)

            # Preflight to surface deterministic policy reverts before spending gas.
            try:
                _vault.functions.executePayment(
                    agent_id_bytes,
                    recipient_address,
                    amount_units,
                ).call({"from": _account.address})
            except Exception as e:
                raise Exception(_format_execute_payment_revert(e))

            global _NONCE_CACHE
            if '_NONCE_CACHE' not in globals():
                _NONCE_CACHE = None

            for attempt in range(4):
                try:
                    pending_nonce = _w3.eth.get_transaction_count(_account.address, "pending")
                    if _NONCE_CACHE is None or _NONCE_CACHE < pending_nonce:
                        _NONCE_CACHE = pending_nonce
                    nonce = _NONCE_CACHE

                    transaction = _vault.functions.executePayment(
                        agent_id_bytes,
                        recipient_address,
                        amount_units,
                    ).build_transaction(
                        {
                            "from": _account.address,
                            "nonce": nonce,
                            "gas": 300000,
                            "gasPrice": _w3.eth.gas_price,
                            "chainId": _w3.eth.chain_id,
                        }
                    )

                    signed_txn = _account.sign_transaction(transaction)
                    tx_hash = _w3.eth.send_raw_transaction(signed_txn.rawTransaction)
                    tx_hash_hex = tx_hash.hex()
                    _NONCE_CACHE = nonce + 1
                    break
                except Exception as e:
                    err_str = str(e).lower()
                    if attempt < 3 and ("nonce too low" in err_str or "already known" in err_str or "replacement transaction underpriced" in err_str or "nonce has already been used" in err_str):
                        _NONCE_CACHE = nonce + 1
                        import asyncio
                        await asyncio.sleep(1)
                        continue
                    raise Exception(f"Failed to submit transaction: {e}")

            try:
                receipt = _w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            except Exception as e:
                raise Exception(f"Transaction timeout or RPC error: {str(e)}")

            if receipt["status"] == 0:
                try:
                    _vault.functions.executePayment(
                        agent_id_bytes,
                        recipient_address,
                        amount_units,
                    ).call({"from": _account.address})
                except Exception as e:
                    raise Exception(_format_execute_payment_revert(e))
                raise Exception("On-chain payment transaction reverted - policy check failed or insufficient balance")

            print(f"[4] Transaction confirmed: {tx_hash_hex}")

        print("[5] Retrying endpoint")
        headers = {"X-Payment-Proof": tx_hash_hex, **base_headers}
        response = await client.get(endpoint, headers=headers)

        if response.status_code >= 400:
            raise Exception(f"Paid call failed ({response.status_code}): {response.text}")

        print("[6] Success")
        return response.json()


async def main():
    """Example usage"""
    agent_id = "agent-001"
    endpoint = "http://127.0.0.1:8000/api/weather"

    try:
        result = await call_paid_endpoint(agent_id, endpoint)
        print("\n=== Result ===")
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f"\n[✗] Error: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main())
