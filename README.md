# SentinelPay: Policy-Enforced Payments for Celo AI Agents

SentinelPay is a security-first infrastructure layer for autonomous AI agents on Celo. It provides deterministic, on-chain policy enforcement that separates **Financial Authority** (Smart Contracts) from **Agent Logic** (AI). Policies are configured by an owner wallet and enforced by the network.

[**View Complete Architecture & Life of a Payment**](docs/ARCHITECTURE.md)

## The Problem
AI agents are rapidly becoming autonomous, but they lack standard, trustless guardrails. Giving an agent a private key is a "blind trust" model — leading to risks like:
- **Policy Drift:** AI logic errors causing overspending.
- **Security Breach:** Private keys being leaked from agent runtimes.
- **Opacity:** No verifiable on-chain reputation for "good acting" agents.

## The Solution: SentinelPay Policy Engine
SentinelPay adds an on-chain policy gate via the `SentinelVault` contract. Policies are keyed by `agent_id` and enforced on-chain; **ERC-8004 identity/reputation hooks are a roadmap item**.

### Our Innovation
- **Deterministic Enforcement:** Limits are enforced by Celo smart contracts, not just backend logic.
- **ERC-8004-aligned (Roadmap):** Identity and reputation integration planned.
- **Defense in Depth (Optional):** HMAC signing, idempotency protection, and on-chain whitelisting when enabled.

## Architecture at a Glance
```
AI Agent -> Python SDK -> SentinelPay API (operator wallet) -> SentinelVault (On-Chain Policy) -> Celo (USDC)
```
> [!TIP]
> **Check out [ARCHITECTURE.md](docs/ARCHITECTURE.md) for a detailed sequence diagram of the payment flow.**

## Quickstart
```bash
# 1) Clone

git clone https://github.com/Code4livingg/sentinelpay.git
cd sentinelpay

# 2) Backend
pip install -r backend/requirements.txt
cd backend
# cp .env.example .env and set CELO_RPC / PRIVATE_KEY / AGENT_VAULT_ADDRESS / USDC_ADDRESS
uvicorn main:app --host 0.0.0.0 --port 8000

# 3) Frontend
cd ../frontend
npm install
npm run dev

# 4) Run demo agent
BACKEND_URL=http://127.0.0.1:8000 python3 ../backend/scripts/run_execute_demo.py
```

## Integration & Verification

To verify your environment is correctly configured:
- Demo guide: [DEMO_GUIDE.md](docs/DEMO_GUIDE.md)
- Automated verification:
  - dry run: `python3 backend/scripts/smoke_test.py --base-url http://127.0.0.1:8000`
  - full (real tx): `python3 backend/scripts/smoke_test.py --execute-demo --base-url http://127.0.0.1:8000`

## SDK (Python)
```python
from sentinelpay import SentinelPayClient

client = SentinelPayClient("https://your-backend.onrender.com", agent_id="weather_agent")
print(client.get_vault_balance())
tx = client.execute_payment(0.50, "0xRecipient")
executions = client.get_executions()
print(tx, executions)
```

## Contract (Celo Sepolia)
- Deploy contracts via `contracts/scripts/deploy.js`
- Set `AGENT_VAULT_ADDRESS` in backend/frontend env after deployment
- Optional explorer base URL: `https://sepolia.celoscan.io`

## Debug Endpoints
- `GET /debug/db-status` — DB backend, row count, schema
- `GET /vault-balance` — USDC balance for the agent vault
- `POST /execute-payment` — execute policy-gated payment with `{ agent_id, recipient, amount_usdc }`
- `GET /payment-jobs` — queued/retried/dead-letter payment jobs

## Production Hardening Flags
Set these in `backend/.env` for production deployments (optional toggles; defaults are relaxed for demo):

- `REQUIRE_OPERATOR_AUTH=true`
- `OPERATOR_API_KEYS=<comma-separated-long-random-keys>`
- `REQUIRE_IDEMPOTENCY_KEY=true`
- `REQUIRE_AGENT_SIGNATURE=true`
- `AGENT_SHARED_SECRET=<long-random-secret-shared-with-agent-runtime>`
- `PAYMENT_WORKER_ENABLED=true`
- `PAYMENT_JOB_MAX_ATTEMPTS=3`
- `PAYMENT_JOB_RETRY_BASE_SECONDS=2`

When enabled:
- Mutating endpoints (`/execute-payment`, `/execute-demo`, `/agent-execute`, `/transactions`) require `X-Operator-Key`.
- Mutating endpoints require `Idempotency-Key` and safely replay identical requests instead of double-executing.
- Agent-triggered endpoints (`/execute-payment`, `/execute-demo`, `/agent-execute`) require HMAC headers:
  `X-Agent-Id`, `X-Agent-Timestamp`, `X-Agent-Signature`.

## Queue Worker
- Payments are executed through a DB-backed job queue (`payment_jobs`) with retry and dead-letter handling.
- Inspect queue state via:
  - `GET /payment-jobs`
  - `GET /payment-jobs/{job_key}`

## Competitive Differentiation
| Capability | SentinelPay (MVP) | Gnosis Safe Limits | ERC-4337 Paymasters |
|---|---|---|---|
| **ERC-8004-aligned (Roadmap)** | ⚠️ | ❌ | ❌ |
| Designed for AI agents (not humans) | ✅ | ❌ | ⚠️ |
| On-chain policy enforcement | ✅ | ⚠️ | ⚠️ |
| Backend-agnostic execution | ⚠️ | ❌ | ⚠️ |
| Execution logging & audit trail | ✅ | ⚠️ | ⚠️ |
| Machine-to-machine native | ✅ | ❌ | ⚠️ |
| Celo-native | ✅ | ⚠️ | ⚠️ |

_Note: MVP execution is initiated by the operator wallet in the backend; backend-agnostic execution is a roadmap target._

## Roadmap
- Wave 1 (Current) — Core infrastructure: SentinelVault contract, policy enforcement, execution logging, observability dashboard
- Wave 2 (Next) — SDK polish, multi-agent UX (multiple agent_ids per vault), automated event polling replacing manual trigger
- Wave 3 — Celo mainnet deployment, first external developer integrations, agent marketplace prototype
- Wave 4 — Cross-chain agent execution support, DAO-controlled policy governance, production SLA
