"""
register_erc8004.py

Registers SentinelPay's weather_agent with the ERC-8004 IdentityRegistry
on Celo Sepolia to qualify for the Track 3 bonus prize ($500 USDT).

ERC-8004 IdentityRegistry: 0x8004A818BFB912233c491871b3d84c89A494BD9e
"""
import asyncio
import os
import sys
from pathlib import Path
from web3 import Web3
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from sdk.sentinelpay_client import get_w3, get_account

# ERC-8004 IdentityRegistry on Celo Sepolia
IDENTITY_REGISTRY_ADDRESS = "0x8004A818BFB912233c491871b3d84c89A494BD9e"

# Minimal ABI — only what we need
IDENTITY_REGISTRY_ABI = [
    {
        "name": "register",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "agentURI", "type": "string"}
        ],
        "outputs": [
            {"name": "agentId", "type": "uint256"}
        ]
    },
    {
        "name": "AgentRegistered",
        "type": "event",
        "anonymous": False,
        "inputs": [
            {"indexed": True,  "name": "agentId",  "type": "uint256"},
            {"indexed": True,  "name": "owner",    "type": "address"},
            {"indexed": False, "name": "agentURI", "type": "string"}
        ]
    }
]

# The agent metadata JSON hosted on GitHub (raw)
# Update this URL once the docs/agent-metadata.json is pushed to master
AGENT_URI = (
    "https://raw.githubusercontent.com/Ryjen1/SentinelPay/master/docs/agent-metadata.json"
)

def load_env() -> None:
    backend_dir = Path(__file__).resolve().parent.parent
    repo_root = backend_dir.parent
    load_dotenv(dotenv_path=backend_dir / ".env")
    load_dotenv(dotenv_path=repo_root / ".env")


async def run():
    load_env()
    w3 = get_w3()
    account = get_account()
    private_key = os.getenv("PRIVATE_KEY")

    if not w3 or not account or not private_key:
        print("❌ Error: Missing configuration (RPC or PRIVATE_KEY).")
        return

    print(f"🔑 Registering from account: {account.address}")
    print(f"📡 Network: {w3.eth.chain_id}")
    print(f"🔗 Agent URI: {AGENT_URI}")

    registry = w3.eth.contract(
        address=Web3.to_checksum_address(IDENTITY_REGISTRY_ADDRESS),
        abi=IDENTITY_REGISTRY_ABI
    )

    # Simulate first
    try:
        sim_result = registry.functions.register(AGENT_URI).call(
            {"from": account.address}
        )
        print(f"🧪 Simulation passed! Expected agentId: {sim_result}")
    except Exception as e:
        print(f"❌ Simulation FAILED: {e}")
        return

    # Build & send transaction
    try:
        nonce = w3.eth.get_transaction_count(account.address)
        tx = registry.functions.register(AGENT_URI).build_transaction({
            "from": account.address,
            "nonce": nonce,
            "gas": 300000,
            "gasPrice": w3.eth.gas_price,
            "chainId": w3.eth.chain_id,
        })

        signed_tx = w3.eth.account.sign_transaction(tx, private_key=private_key)
        raw = getattr(signed_tx, "rawTransaction", None) or getattr(signed_tx, "raw_transaction", None)
        tx_hash = w3.eth.send_raw_transaction(raw)

        print(f"🚀 Transaction sent! Hash: {tx_hash.hex()}")
        print("⏳ Waiting for confirmation...")

        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        if receipt.status == 1:
            print("✅ SUCCESS! SentinelPay weather_agent is now ERC-8004 registered!")
            print(f"   Tx: https://sepolia.celoscan.io/tx/{tx_hash.hex()}")
            print("\n🏆 You are now eligible for the Track 3 ERC-8004 bonus prize!")
        else:
            print("❌ Transaction reverted.")

    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    asyncio.run(run())
