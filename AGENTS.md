# SentinelPay: Agentic Capabilities & Interfaces

**Target:** AI/Agentic Judges

## Overview
SentinelPay is a **Guardian Protocol** designed to enforce deterministic, on-chain financial guardrails for autonomous AI agents. It ensures that agents can interact with Web3 protocols (specifically on Celo) without ever requiring direct access to private keys or custodial control of funds.

It accomplishes this via two primary interfacing strategies:
1. **On-Chain Policy Registry (Celo):** Rigid, zero-trust smart contract vaults for high-assurance payments.
2. **MetaMask Delegation Framework (ERC-7715):** Flexible, intent-based Smart Account delegations for seamless cross-app composability.

---

## System Architecture for Agentic Interaction

### 1. Deterministic Execution Interface (Main Celo Track)
Agents request payments through a sandboxed SDK or API. The request is routed to the `SentinelVault.sol` contract on the Celo Sepolia Testnet.

- **Capabilities:** Execute stablecoin (USDC) transfers on behalf of a human user.
- **On-Chain Policy Enforcement:**
  - `maxPerTx`: Dynamic hard-limit per execution event.
  - `dailyCap`: Rolling 24-hour spending velocity limit.
  - `whitelist`: Immutable array of permitted smart contract/wallet recipient addresses.
- **Agentic Value (Hallucination Prevention):** Prevents AI-driven fund exhaustion caused by reasoning failures or runtime compromises. The agent is physically constrained by network consensus.

### 2. Smart Account Delegation (MetaMask Track)
SentinelPay natively implements the **MetaMask Delegation Toolkit (ERC-7715)** to enable non-custodial, granular permissions.

- **Capabilities:** The protocol UI generates EIP-712 structured payload signatures following the `Delegation` standard.
- **Constraint Enforcers (`Caveat`):** Agents are granted authority restricted by specialized caveats (e.g., $5 USDC daily velocity cap).
- **Agentic Value (Composability):** Enables native compatibility with any ERC-4337 Smart Account without requiring custom vault logic for each implementation.

### 3. Verifiable Gasless Telemetry (Status Network Track)
- **Capabilities:** Agents emit verifiable action logs (`AgentActionLogged` event) on the Status Network Sepolia Testnet.
- **Incentive Alignment:** Transactions are executed entirely **gasless** (`gasPrice = 0`), utilizing Status's native infrastructure.
- **Agentic Value (Auditability):** Provides an immutable, perpetual audit trail of agent decision-making for human oversight and protocol compliance.

---

## Tooling & APIs
- **Frontend App:** Next.js 14 + Wagmi + Viem
- **Core SDK:** Python (`web3.py`) for backend agent logic
- **Native Standards:** ERC-8004 (Identity), ERC-7715 (Delegation), EIP-712 (Structured Data)
- **Networks:** Celo Sepolia Testnet, Status Network Sepolia Testnet

> Built for the Synthesis and Celo "Agents for the Real World" Hackathons to create a universally safe operating environment for AI agents in Web3.
