# SentinelPay Pitch

---

Here's something nobody talks about with AI agents — they can spend money.

Not in theory. Right now. Agents are booking services, paying for APIs, moving funds — all on their own. And the way most people handle that today is they just hand the agent a private key and hope for the best.

That's the gap SentinelPay fills.

We built SentinelPay because we realized the real problem isn't making agents smarter — it's making them *safe to trust with money*. An agent can hallucinate. Its runtime can get compromised. But if your spending rules live on the blockchain, none of that matters. The chain enforces the limits before any money moves.

The way it works is pretty simple. You define a policy — a daily cap, a list of addresses the agent is allowed to pay, whether it's active or paused. That policy lives in a smart contract on Celo. When the agent tries to make a payment, the contract checks the policy first. If anything is off, the transaction never goes through. The agent can't override it. Nobody can.

We tested this with what we call the Rogue Agent demo. We deliberately wrote an agent that tries to cheat — pays a random address, blows past the daily limit, keeps running after it's been paused. Every single attempt gets rejected on-chain. That's the point.

On the developer side, we kept it simple. There's a Python SDK, an MCP server so agents like Nanobot or Cursor can plug in without any custom code, and a live demo anyone can try right now at sentinelpay.vercel.app.

We built this on Celo because the economics make sense — fast finality, stablecoin payments, fees low enough that a $0.05 micro-payment is actually worth making.

The agentic economy is coming. SentinelPay makes sure it doesn't go broke — or rogue — getting there.
