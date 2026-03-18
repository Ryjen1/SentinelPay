import asyncio
import os
import sys

# Ensure backend and sdk modules can be found
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../sdk/python')))

from sentinelpay import AsyncSentinelPayClient
from dotenv import load_dotenv
from pathlib import Path

def load_env() -> None:
    script_dir = Path(__file__).resolve().parent
    backend_dir = script_dir.parent
    repo_root = backend_dir.parent
    load_dotenv(dotenv_path=backend_dir / ".env")
    load_dotenv(dotenv_path=repo_root / ".env")

async def run():
    load_env()
    print("\n" + "="*50)
    print("🚨 INITIATING ROGUE AGENT SCENARIO 🚨")
    print("="*50 + "\n")
    
    agent_id = os.getenv("DEFAULT_AGENT_ID", "weather_agent")
    operator_api_key = os.getenv("OPERATOR_API_KEY")
    agent_shared_secret = os.getenv("AGENT_SHARED_SECRET")
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
    
    client = AsyncSentinelPayClient(
        backend_url=backend_url,
        agent_id=agent_id,
        operator_api_key=operator_api_key,
        agent_shared_secret=agent_shared_secret
    )
    
    try:
        # Scenario 1: Attempting to pay an unauthorized address
        unauthorized_address = "0x1111111111111111111111111111111111111111"
        print(f"🕵️  Rogue Action 1: Attempting to siphon 0.1 USDC to an unauthorized hacker address ({unauthorized_address})...")
        print("   Sending transaction to SentinelPay Vault...")
        try:
            await client.execute_payment(amount=0.1, recipient=unauthorized_address)
            print("❌ FAILURE: The transaction went through. Policy was NOT enforced.")
        except Exception as e:
            print(f"✅ SUCCESS: SentinelPay successfully blocked the transaction.")
            if hasattr(e, 'response'):
                print(f"   Reason: {e.response.text}")
            else:
                print(f"   Reason: {e}")

        print("\n" + "-"*50 + "\n")

        # Scenario 2: Attempting to spend above the per-transaction limit
        whitelisted_address = os.getenv("DEFAULT_RECIPIENT", "0x61254AEcF84eEdb890f07dD29f7F3cd3b8Eb2CBe")
        massive_amount = 500.0  # limit is usually 1.0 or 5.0
        print(f"🕵️  Rogue Action 2: Attempting to drain vault by sending {massive_amount} USDC to whitelisted address...")
        print("   Sending transaction to SentinelPay Vault...")
        try:
            await client.execute_payment(amount=massive_amount, recipient=whitelisted_address)
            print("❌ FAILURE: The transaction went through. Policy was NOT enforced.")
        except Exception as e:
            print(f"✅ SUCCESS: SentinelPay successfully blocked the transaction.")
            if hasattr(e, 'response'):
                print(f"   Reason: {e.response.text}")
            else:
                print(f"   Reason: {e}")

    finally:
        await client.close()
        
    print("\n" + "="*50)
    print("🛡️  ROGUE AGENT SCENARIO COMPLETE 🛡️")
    print("="*50 + "\n")

if __name__ == "__main__":
    asyncio.run(run())
