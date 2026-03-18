import asyncio
import os
import sys

# Ensure backend and sdk modules can be found
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../sdk/python')))

from sentinelpay import AsyncSentinelPayClient

async def run():
    print("Testing AsyncSentinelPayClient...")
    
    # We will just construct the client and call a simple endpoint
    client = AsyncSentinelPayClient(
        backend_url="http://127.0.0.1:8000",
        agent_id="test_async_agent"
    )
    
    try:
        balance = await client.get_vault_balance()
        print(f"Vault balance retrieved via async client: {balance} USDC")
    except Exception as e:
        print(f"Failed to fetch vault balance: {e}")
    finally:
        await client.close()
        
    print("Async SDK test finished.")

if __name__ == "__main__":
    asyncio.run(run())
