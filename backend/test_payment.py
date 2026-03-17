import asyncio
from sdk.sentinelpay_client import call_paid_endpoint

async def main():
    result = await call_paid_endpoint(
        agent_id="weather_agent",
        endpoint="http://127.0.0.1:8000/api/weather"
    )
    print(result)

asyncio.run(main())
