import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from sdk.sentinelpay_client import call_paid_endpoint

backend_env = Path(__file__).resolve().parent / ".env"
root_env = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=backend_env)
load_dotenv(dotenv_path=root_env)

@tool
async def weather_tool(city: str) -> str:
    """Get current weather data for a city. Costs 0.001 USDC per call."""
    print(f"> Action: weather_api_tool (city={city})")
    result = await call_paid_endpoint(
        agent_id="weather_agent",
        endpoint="http://127.0.0.1:8000/api/weather"
    )
    return str(result)

@tool
async def data_feed_tool(symbol: str) -> str:
    """Get market data feed. Costs 0.002 USDC per call."""
    print(f"> Action: data_feed_tool (symbol={symbol})")
    result = await call_paid_endpoint(
        agent_id="weather_agent",
        endpoint="http://127.0.0.1:8000/api/data-feed"
    )
    return str(result)

async def run_agent(task: str):
    print(f"\n> Entering SentinelPay Demo Agent...")
    print(f"> Task: \"{task}\"")
    print()
    
    llm = ChatOpenAI(
        model="gpt-3.5-turbo",
        temperature=0,
        openai_api_key=os.getenv("OPENAI_API_KEY")
    )
    
    tools = [weather_tool, data_feed_tool]
    llm_with_tools = llm.bind_tools(tools)
    
    messages = [
        SystemMessage(content="You are an AI agent that can fetch weather and market data by calling paid APIs. Use the available tools to answer the user's question."),
        HumanMessage(content=task)
    ]
    
    print("> Thinking...")
    response = await llm_with_tools.ainvoke(messages)
    
    # Check if tool calls were made
    if response.tool_calls:
        for tool_call in response.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]
            
            print(f"> Calling tool: {tool_name} with args: {tool_args}")
            
            # Execute the tool
            if tool_name == "weather_tool":
                result = await weather_tool.ainvoke(tool_args)
            elif tool_name == "data_feed_tool":
                result = await data_feed_tool.ainvoke(tool_args)
            
            print(f"> Tool result: {result}")
            
            # Add tool result to messages and get final response
            messages.append(response)
            messages.append(HumanMessage(content=f"Tool result: {result}"))
            
            final_response = await llm.ainvoke(messages)
            print(f"\n> Final Answer: {final_response.content}")
    else:
        print(f"\n> Final Answer: {response.content}")
    
    print(f"> Session complete.")
    
    return response

if __name__ == "__main__":
    asyncio.run(run_agent("Get current weather in Bangalore and summarize it"))
