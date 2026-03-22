import asyncio
import os
import sys

# Ensure backend and sdk modules can be found when run from the scripts directory
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../sdk/python')))

from mcp.server.fastmcp import FastMCP
from sentinelpay import AsyncSentinelPayClient
from dotenv import load_dotenv
from pathlib import Path

def load_env() -> None:
    script_dir = Path(__file__).resolve().parent
    backend_dir = script_dir.parent
    repo_root = backend_dir.parent
    load_dotenv(dotenv_path=backend_dir / ".env")
    load_dotenv(dotenv_path=repo_root / ".env")

# Initialize the MCP Server
mcp = FastMCP("SentinelPay")

@mcp.tool()
async def execute_payment(amount: float, recipient: str, description: str = "") -> str:
    """
    Executes a secure, on-chain stablecoin payment from the agent's vault using the SentinelPay policy layer.
    
    Args:
        amount: The amount of USDC to send.
        recipient: The Ethereum address (0x...) to send the funds to.
        description: A short explanation of why the agent is making this payment (for audibility).
    """
    load_env()
    
    agent_id = os.getenv("DEFAULT_AGENT_ID", "weather_agent")
    operator_api_key = os.getenv("OPERATOR_API_KEY")
    agent_shared_secret = os.getenv("AGENT_SHARED_SECRET")
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
    
    # We must ensure we have credentials in the environment
    if not operator_api_key or not agent_shared_secret:
        return "❌ CONFIGURATION ERROR: SentinelPay credentials (OPERATOR_API_KEY, AGENT_SHARED_SECRET) are missing from the environment."

    client = AsyncSentinelPayClient(
        backend_url=backend_url,
        agent_id=agent_id,
        operator_api_key=operator_api_key,
        agent_shared_secret=agent_shared_secret
    )
    
    try:
        # In a real environment, the Relayer verifies and submits the payment to the Vault.
        tx_data = await client.execute_payment(amount=amount, recipient=recipient)
        tx_hash = tx_data.get('tx_hash', 'Unknown (Settled off-chain or indexing delayed)')
        return f"✅ SUCCESS: Payment of {amount} USDC to {recipient} has been executed securely on-chain. TX Hash: {tx_hash}"
    except Exception as e:
        error_msg = str(e)
        if hasattr(e, 'response') and getattr(e.response, 'text', None):
            error_msg = e.response.text
        return f"❌ FAILURE: SentinelPay Policy blocked the transaction. Reason: {error_msg}"
    finally:
        await client.close()

if __name__ == "__main__":
    # Start the MCP stdio server
    mcp.run(transport='stdio')
