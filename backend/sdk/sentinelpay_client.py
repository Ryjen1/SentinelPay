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
from eth_account import Account
import httpx
from dotenv import load_dotenv

# Load environment variables from backend/.env first, then root .env as fallback.
backend_env_path = Path(__file__).resolve().parent.parent / ".env"
root_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=backend_env_path)
load_dotenv(dotenv_path=root_env_path)

# Environment variables
ALCHEMY_RPC = os.getenv("CELO_RPC") or os.getenv("ALCHEMY_RPC")
PRIVATE_KEY = os.getenv("PRIVATE_KEY")
AGENT_VAULT_ADDRESS = os.getenv("AGENT_VAULT_ADDRESS")
USDC_ADDRESS = os.getenv("USDC_ADDRESS") or os.getenv("PAYMENT_TOKEN_ADDRESS")
BACKEND_URL = "http://127.0.0.1:8000"
NETWORK_NAME = os.getenv("NETWORK_NAME", "Celo Sepolia")
CHAIN_ID = int(os.getenv("CHAIN_ID", "11142220"))

# Mock mode flag
MOCK_MODE = os.getenv("MOCK_PAYMENT", "false").lower() == "true"

# Global instances (initialized on first use or lazily)
w3 = None
account = None
agent_vault = None

def get_w3():
    global w3
    if w3 is None and not MOCK_MODE:
        if not ALCHEMY_RPC:
            print("[error] CELO_RPC not set")
            return None
        w3 = Web3(Web3.HTTPProvider(ALCHEMY_RPC))
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

# Initial check for logging
if MOCK_MODE:
    print("[✓] Running in MOCK MODE")
else:
    if not all([ALCHEMY_RPC, PRIVATE_KEY, AGENT_VAULT_ADDRESS, USDC_ADDRESS]):
        print("[!] Warning: Missing required environment variables for on-chain payments")


async def call_paid_endpoint(agent_id: str, endpoint: str) -> dict:
    """
    Call a paid API endpoint with automatic on-chain payment execution
    """
    _w3 = get_w3()
    _account = get_account()
    _vault = get_vault()

    async with httpx.AsyncClient() as client:
        print("[1] Calling endpoint")
        response = await client.get(endpoint)

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

            nonce = _w3.eth.get_transaction_count(_account.address)

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

            try:
                receipt = _w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            except Exception as e:
                raise Exception(f"Transaction timeout or RPC error: {str(e)}")

            if receipt["status"] == 0:
                raise Exception(
                    "On-chain payment transaction reverted - policy check failed or insufficient balance"
                )

            print(f"[4] Transaction confirmed: {tx_hash_hex}")

        print("[5] Retrying endpoint")
        headers = {"X-Payment-Proof": tx_hash_hex}
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
