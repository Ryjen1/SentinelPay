"""
SentinelPay Demo - Simple agent without OpenAI dependency
Demonstrates automatic payment handling for paid API calls
"""

import asyncio
from sdk.sentinelpay_client import call_paid_endpoint

async def demo_weather_agent():
    """
    Simple demo agent that fetches weather data
    Automatically handles 402 payment flow
    """
    
    print("\n" + "="*60)
    print("SentinelPay Demo Agent - Weather Fetcher")
    print("="*60)
    
    print("\n[Agent] Task: Get weather data for Bangalore")
    print("[Agent] Analyzing request...")
    print("[Agent] Decision: Need to call weather API")
    print("[Agent] Initiating payment and API call...\n")
    
    # Call the paid endpoint - payment is handled automatically
    result = await call_paid_endpoint(
        agent_id="weather_agent",
        endpoint="http://127.0.0.1:8000/api/weather"
    )
    
    print("\n[Agent] Processing response...")
    print(f"[Agent] Weather data received: {result}")
    
    # Simulate agent reasoning
    print("\n[Agent] Summary:")
    print(f"  - City: {result.get('city', 'N/A')}")
    print(f"  - Temperature: {result.get('temperature', 'N/A')}")
    print(f"  - Condition: {result.get('condition', 'N/A')}")
    print(f"  - Humidity: {result.get('humidity', 'N/A')}")
    print(f"  - Payment Status: {'Paid' if result.get('paid') else 'Unpaid'}")
    
    print("\n[Agent] Task completed successfully!")
    print("="*60 + "\n")
    
    return result

async def demo_market_agent():
    """
    Simple demo agent that fetches market data
    Automatically handles 402 payment flow
    """
    
    print("\n" + "="*60)
    print("SentinelPay Demo Agent - Market Data Fetcher")
    print("="*60)
    
    print("\n[Agent] Task: Get crypto market data")
    print("[Agent] Analyzing request...")
    print("[Agent] Decision: Need to call data feed API")
    print("[Agent] Initiating payment and API call...\n")
    
    # Call the paid endpoint - payment is handled automatically
    result = await call_paid_endpoint(
        agent_id="weather_agent",
        endpoint="http://127.0.0.1:8000/api/data-feed"
    )
    
    print("\n[Agent] Processing response...")
    print(f"[Agent] Market data received: {result}")
    
    # Simulate agent reasoning
    print("\n[Agent] Summary:")
    print(f"  - Market: {result.get('market', 'N/A')}")
    print(f"  - BTC Price: ${result.get('btc_price', 'N/A')}")
    print(f"  - ETH Price: ${result.get('eth_price', 'N/A')}")
    print(f"  - CELO Price: ${result.get('celo_price', 'N/A')}")
    print(f"  - Trend: {result.get('trend', 'N/A')}")
    print(f"  - Payment Status: {'Paid' if result.get('paid') else 'Unpaid'}")
    
    print("\n[Agent] Task completed successfully!")
    print("="*60 + "\n")
    
    return result

async def main():
    """Run both demo agents"""
    
    print("\n🤖 SentinelPay Demo - Autonomous AI Agents with Payment Capabilities")
    print("This demo shows how AI agents can automatically pay for API access\n")
    
    # Demo 1: Weather Agent
    await demo_weather_agent()
    
    # Small delay for readability
    await asyncio.sleep(1)
    
    # Demo 2: Market Data Agent
    await demo_market_agent()
    
    print("\n✅ Demo complete! Both agents successfully:")
    print("   1. Detected 402 Payment Required")
    print("   2. Executed on-chain payment (mock mode)")
    print("   3. Retrieved paid API data")
    print("   4. Processed and summarized results\n")

if __name__ == "__main__":
    asyncio.run(main())
