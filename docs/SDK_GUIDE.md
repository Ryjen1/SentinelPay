# SentinelPay SDK Guide

The **SentinelPay Python SDK** provides a simple, async-first interface for AI agents to make secure, policy-governed payments on Celo.

---

## Installation

```bash
pip install sentinelpay
```

Or install from source:
```bash
cd sdk/python
pip install -e .
```

---

## Quick Start

### Sync Client

```python
from sentinelpay import SentinelPayClient

client = SentinelPayClient(
    backend_url="https://your-backend.vercel.app",
    agent_id="my_agent",
    operator_api_key="your_operator_key",
    agent_shared_secret="your_shared_secret"
)

# Execute a policy-governed payment
result = client.execute_payment(amount=0.5, recipient="0xRecipientAddress...")
print(result)  # {"tx_hash": "0x...", "status": "success"}
```

### Async Client (for LangChain, CrewAI, etc.)

```python
import asyncio
from sentinelpay import AsyncSentinelPayClient

async def main():
    client = AsyncSentinelPayClient(
        backend_url="https://your-backend.vercel.app",
        agent_id="my_agent",
        operator_api_key="your_operator_key",
        agent_shared_secret="your_shared_secret"
    )
    try:
        result = await client.execute_payment(amount=0.5, recipient="0xRecipient...")
        print(result)
    finally:
        await client.close()

asyncio.run(main())
```

---

## Policy Enforcement

Every payment is validated against a policy registered on the **Celo PolicyRegistry** smart contract. If the payment violates any rule, the transaction is blocked — **before any gas is spent**.

| Policy Rule | Description |
|---|---|
| `maxPerTx` | Maximum USDC per single transaction |
| `dailyCap` | Maximum USDC per day |
| `whitelist` | Allowed recipient addresses |
| `isActive` | Whether the agent is enabled |

---

## Error Handling

```python
try:
    await client.execute_payment(amount=500.0, recipient="0x...")
except Exception as e:
    # e.g. "Amount exceeds per-transaction policy limit."
    # e.g. "Recipient is not whitelisted in policy."
    print(f"Blocked by SentinelPay: {e}")
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `BACKEND_URL` | URL of your SentinelPay backend |
| `OPERATOR_API_KEY` | API key for operator authentication |
| `AGENT_SHARED_SECRET` | HMAC secret for agent signature |
| `DEFAULT_AGENT_ID` | Agent identifier string |

---

## Demo

Run the included Rogue Agent scenario to see the SDK in action:

```bash
python3 backend/scripts/rogue_agent_demo.py
```

This demonstrates two blocked attack vectors:
1. **Unauthorized Recipient:** Payment to a non-whitelisted address → **BLOCKED**
2. **Overspending:** Payment exceeding the per-tx limit → **BLOCKED**

---

## Full Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design.
