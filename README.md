<div align="center">
  <img src="https://raw.githubusercontent.com/Ryjen1/SentinelPay/main/frontend/public/favicon.ico" alt="SentinelPay Logo" width="80" height="80">
  
  # SentinelPay
  
  **Secure, On-Chain Policy Enforcement for Celo AI Agents**

  [![Deploy on Vercel](https://vercelbadge.vercel.app/api/Ryjen1/sentinelpay)](https://sentinelpay.vercel.app/)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Celo Sepolia](https://img.shields.io/badge/Network-Celo%20Sepolia-33d399.svg)](https://celoscan.io/)

  [**Live Web Demo**](https://sentinelpay.vercel.app/) • [**Architecture Docs**](docs/ARCHITECTURE.md) • [**SDK Guide**](docs/SDK_GUIDE.md)
</div>

---

## 🧭 What is SentinelPay?

**SentinelPay** is the security-first financial layer for the agentic economy. 

As AI agents move from "chatbots" to "economic actors," they need the ability to spend funds autonomously. However, giving an AI agent full access to a private key is a massive security risk. SentinelPay solves this by moving the **Spending Policy** on-chain.

By separating **Agent Logic** (the AI) from **Financial Authority** (the Smart Contract), SentinelPay ensures that even if an agent hallucinates or its runtime is compromised, its spending power is strictly contained within verifiable, immutable constraints.

---

## 🛡️ Core Value Proposition

- **On-Chain Policy Enforcement:** No more "blind trust." Spending limits, whitelists, and quotas are enforced by Celo smart contracts, not just soft-coded in Python.
- **Async-First Infrastructure:** Engineered for modern agent frameworks (Langchain, CrewAI) with a high-performance, non-blocking Python SDK.
- **Gas-Optimized Architecture:** $O(1)$ whitelist verification ensures that scaling your agent's ecosystem doesn't scale your infrastructure costs.
- **Celo-Native Speed & Stability:** Leverages Celo's sub-second finality and the USDC stablecoin ecosystem for instantaneous, reliable payments.
- **ERC-8004 Agent Identity:** SentinelPay agents are registered on the ERC-8004 IdentityRegistry, giving each agent a verifiable on-chain identity for discovery and trust across the Celo ecosystem.

---

## 🏗️ Technical Architecture (Defense-in-Depth)

SentinelPay implements a multi-layered security model:

### 1. Off-Chain Perimeter (Relayer)
- **HMAC Signatures:** Ensures that only authorized agent instances can request payments.
- **Idempotency Tracking:** Guaranteed "exactly-once" payment delivery, critical for unstable network environments.
- **Environment Isolation:** Robust backend synchronization optimized for serverless (Vercel) scale.

### 2. On-Chain Control (Celo L2)
- **Immutable Rules:** Spending constraints are stored on-chain in `PolicyRegistry.sol`.
- **Vault Security:** Funds are held in `SentinelVault.sol`. The relayer never handles seed phrases or the actual USDC; it only "requests" execution, which the vault validates before release.
- **Linear Scalability:** Real-time whitelists implemented via nested mappings for maximum gas efficiency.

---

## 🌈 Why Celo?

- **Near-Instant Settlement:** AI agents require rapid feedback loops. Celo's block times are perfect for real-time agentic commerce.
- **Stablecoin First:** Built-in USDC support ensures that agent policies are defined in stable values, not volatile gas tokens.
- **Ultra-Low Fees:** Allows for high-frequency micro-payments (e.g., $0.05 per API call) that would be impossible on most other chains.

---

## 🪪 On-Chain Agent Identity (ERC-8004)

SentinelPay agents are registered on the **ERC-8004 IdentityRegistry** — Celo's standard for trustless, discoverable AI agents.

| Field | Value |
|---|---|
| **Agent** | `weather_agent` |
| **AgentId** | `#57` |
| **Registry** | [`0x8004A818...`](https://sepolia.celoscan.io/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |
| **Metadata** | [agent-metadata.json](docs/agent-metadata.json) |
| **Tx** | [`0x433b569b...`](https://sepolia.celoscan.io/tx/0x433b569b03a4c896507d57b0d095c1cf0d869f95313a1041a0ab32f06ed53c5d) |

Any protocol or marketplace on Celo can **discover, verify, and trust** SentinelPay agents without needing off-chain coordination.

---

## 🌍 Ecosystem & Standards Compatibility

SentinelPay is designed to be a universal security layer that integrates seamlessly with the leading standards in the agentic Web3 ecosystem.

### 🛡️ Core Protocol Standards
- **ERC-8004 (Agent Identity):** Every SentinelPay agent is registered with a verifiable on-chain identity, ensuring discoverability and trust across the Celo ecosystem.
- **ERC-7715 (Omni-Delegation):** Native support for intent-based permissions, allowing users to grant granular authority to agents without sacrificing custodial control.
- **USDC-Native (Stable Commerce):** Hard-coded support for USDC on Celo Sepolia to ensure policies are deterministic and stable.

---

## 🤝 Native Integrations

We provide first-class support for ecosystem partners to create a more secure and composable operating environment for AI agents.

### 🦊 MetaMask Delegation Framework
Users can generate **EIP-712 Delegation Signatures** directly from the SentinelPay Dashboard. These follow the **ERC-7715 standard**, enabling the agent to operate within strict boundary-specific caveats (e.g., $5 max daily spend) compatible with modern Smart Accounts.

### ⛽ Status Network Telemetry
To provide an immutable and cost-effective audit trail, SentinelPay mirrors agent decision logs on the **Status Network Sepolia Testnet**. By utilizing **`gasPrice = 0`**, we ensure that high-frequency agent telemetry is permanently recorded on-chain without infrastructure overhead.

---

### SentinelPay MCP Server (Zero-Config Integration)
To allow *any* agent (OpenClaw, ElizaOS, Nanobot, Cursor) to use SentinelPay without writing custom integration code, we have built a **Model Context Protocol (MCP)** server.

#### Running with Nanobot
The fastest way to join The Synthesis is to run our MCP server and point your agent at the hackathon skill file:

1. Copy the example Nanobot config (remember to add your LLM API key):
```bash
cp backend/scripts/nanobot_config.json ~/.nanobot/config.json
```
2. Start Nanobot and register for the hackathon:
```bash
nanobot agent "join this hackathon -> https://synthesis.md/skill.md"
```
Your agent now has a secure, Celo-backed financial layer and is officially registered for The Synthesis!

---

## 🎮 The "Rogue Agent" Demo

We've battle-tested SentinelPay with a "Rogue Agent" simulator. Watch it in action!

```bash
# Terminal 1: Start backend
cd backend
pip install -r requirements.txt
cp .env.example .env # Configure Celo RPC and Vault Address
uvicorn main:app --host 0.0.0.0 --port 8000

# Terminal 2: Unleash the Rogue Agent
python3 backend/scripts/rogue_agent_demo.py
```
**The Demo Scenario:**
1. Agent tries to pay a **non-whitelisted** address. ➔ **REJECTED** on-chain.
2. Agent tries to **exceed its daily cap**. ➔ **REJECTED** on-chain.
3. Agent is **Paused** by the operator. ➔ **ALL** payments blocked instantly.

---

## 📦 Developer Quickstart

Integrating into your own agent is simple:

```python
from sentinelpay import AsyncSentinelPayClient

async def run_agent():
    # Instantiate the async, non-blocking client
    client = AsyncSentinelPayClient("https://your-backend.example", agent_id="trade_bot")
    
    # Attempt an on-chain execution
    try:
        tx = await client.execute_payment(amount=1.50, recipient="0xWhitelisted...")
        print(f"Payment successful: {tx['tx_hash']}")
    except Exception as e:
        print(f"Policy violation prevented payment: {e}")
```

---

## 💻 Live Web Demo

1. **Visit [sentinelpay.vercel.app](https://sentinelpay.vercel.app)**
2. Connect your Celo Sepolia wallet.
3. Run the **Integrated Demo** to see sub-second balance settlement and policy checks in real-time.

---

## 📄 License
MIT License. Built with ❤️ for the Celo Ecosystem.
