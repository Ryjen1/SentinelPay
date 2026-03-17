'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';

const policyFields = [
  {
    field: 'maxPerTx',
    type: 'uint256',
    unit: 'USDC (6 decimals)',
    description: 'Maximum USDC allowed per single transaction. Any payment above this amount is reverted by the smart contract.',
    example: '1_000_000 → 1 USDC',
  },
  {
    field: 'dailyCap',
    type: 'uint256',
    unit: 'USDC (6 decimals)',
    description: 'Maximum total USDC the agent can spend within a rolling 24-hour window. Resets each day.',
    example: '5_000_000 → 5 USDC/day',
  },
  {
    field: 'whitelist',
    type: 'address[]',
    unit: 'Ethereum addresses',
    description: 'Array of recipient addresses the agent is permitted to pay. Payments to non-whitelisted addresses are reverted.',
    example: '["0xRecipient1", "0xRecipient2"]',
  },
];

const lifecycle = [
  { step: '01', title: 'Owner registers agent', detail: 'Calls registerAgent() on PolicyRegistry with desired limits and whitelist.' },
  { step: '02', title: 'Agent requests payment', detail: 'Agent calls the backend API; optional HMAC/idempotency checks run before the operator wallet submits a tx.' },
  { step: '03', title: 'Contract enforces policy', detail: 'SentinelVault verifies all three rules on-chain. Any violation causes a revert.' },
  { step: '04', title: 'Settlement or revert', detail: 'Valid payments transfer USDC and emit PaymentExecuted. Invalid ones revert with no funds moved.' },
];

export default function Policies() {
  return (
    <main className="min-h-screen text-white" style={{ backgroundColor: 'var(--primary-bg)' }}>
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-cross-grid opacity-60" />
      </div>

      <Navbar variant="fixed" />

      <div className="relative z-10 max-w-4xl mx-auto px-6 pt-28 pb-20">
        <Link href="/" className="text-sm mb-8 block text-slate-600 hover:text-white transition-colors no-underline">
          ← Back to home
        </Link>

        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4 text-[11px] font-bold bg-violet-500/[0.07] border border-violet-500/20 text-violet-400">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
            </svg>
            Policy Engine
          </div>
          <h1 className="text-3xl font-black mb-3" style={{ fontFamily: 'var(--font-heading)' }}>Policies</h1>
          <p className="text-sm leading-relaxed max-w-2xl text-slate-400">
            SentinelPay&apos;s policy engine is enforced entirely on-chain by PolicyRegistry.sol. Agents cannot
            modify their own rules — only the vault owner can. Every payment is checked against three
            on-chain constraints before any funds move (policies are owner-updatable).
          </p>
        </div>

        {/* Policy fields */}
        <div className="mb-14">
          <p className="text-[10px] font-bold font-mono uppercase tracking-widest mb-6 text-slate-600">Policy Parameters</p>
          <div className="space-y-3">
            {policyFields.map((p) => (
              <div
                key={p.field}
                className="rounded-xl p-5 border border-white/[0.07] card-interactive"
                style={{ backgroundColor: 'rgba(6,6,14,0.8)' }}
              >
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <code
                    className="text-sm font-mono font-semibold px-2 py-0.5 rounded bg-violet-500/[0.08] text-violet-400 border border-violet-500/20"
                  >
                    {p.field}
                  </code>
                  <span className="text-xs font-mono px-2 py-0.5 rounded text-slate-500 border border-white/[0.07]">
                    {p.type}
                  </span>
                  <span className="text-xs text-slate-600">{p.unit}</span>
                </div>
                <p className="text-sm mb-2 text-slate-400">{p.description}</p>
                <code className="text-xs font-mono text-slate-600">e.g. {p.example}</code>
              </div>
            ))}
          </div>
        </div>

        {/* Policy lifecycle */}
        <div className="mb-14">
          <p className="text-[10px] font-bold font-mono uppercase tracking-widest mb-6 text-slate-600">Enforcement Lifecycle</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {lifecycle.map(({ step, title, detail }) => (
              <div
                key={step}
                className="card-interactive rounded-xl p-5 border border-white/[0.07]"
                style={{ backgroundColor: 'rgba(6,6,14,0.8)' }}
              >
                <div className="text-xs font-mono font-bold mb-2 text-cyan-400">{step}</div>
                <div className="text-sm font-semibold mb-1 text-white" style={{ fontFamily: 'var(--font-heading)' }}>{title}</div>
                <div className="text-xs leading-relaxed text-slate-500">{detail}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Example code */}
        <div>
          <p className="text-[10px] font-bold font-mono uppercase tracking-widest mb-4 text-slate-600">Example Policy Registration</p>
          <div
            className="rounded-xl p-5 overflow-x-auto border border-white/[0.07]"
            style={{ backgroundColor: 'rgba(4,4,8,0.9)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#d1d5db', whiteSpace: 'pre' }}
          >
            {`// Solidity — called by vault owner
registry.registerAgent(
  agentId,
  maxPerTx  = 1_000_000,   // 1.00 USDC  (6 decimals)
  dailyCap  = 5_000_000,   // 5.00 USDC/day
  whitelist = [
    "0xRecipient1",
    "0xRecipient2"
  ]
);

// Python SDK call (contract enforces limits)
client.execute_payment(0.50, "0xRecipient1")
# → ✅ within limits → on-chain success
client.execute_payment(2.00, "0xRecipient1")
# → ❌ exceeds maxPerTx → reverted, 0 funds moved`}
          </div>
        </div>
      </div>
    </main>
  );
}
