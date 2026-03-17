'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';

const layers = [
  {
    icon: '👤',
    label: 'User / Operator Layer',
    title: 'Owner Wallet',
    description: 'Sets spending policy via PolicyRegistry, funds the SentinelVault with USDC, and retains the ability to pause agents or withdraw at any time.',
    accent: false,
  },
  {
    icon: '🛡️',
    label: 'Smart Contract Layer',
    title: 'SentinelVault.sol',
    description: 'Holds USDC funds, validates policy on-chain, executes payments to whitelisted recipients, and emits fully auditable PaymentExecuted events.',
    accent: true,
  },
  {
    icon: '📋',
    label: 'Smart Contract Layer',
    title: 'PolicyRegistry.sol',
    description: 'Stores per-agent rules: maxPerTx, dailyCap, and whitelisted recipient addresses. Updated only by the vault owner — agents cannot alter their own policy.',
    accent: true,
  },
  {
    icon: '🤖',
    label: 'AI Agent Layer',
    title: 'Python SDK + Agent',
    description: 'Calls the backend /execute-payment endpoint with optional HMAC/idempotency; the operator wallet submits the on-chain tx.',
    accent: false,
  },
  {
    icon: '🌐',
    label: 'External API Layer',
    title: 'Paid API Provider',
    description: 'Optional paid API flow: returns data after receiving a valid payment proof header (X-Payment-Proof).',
    accent: false,
  },
];

const guarantees = [
  ['Agent never holds private keys', 'Signing always happens at the operator wallet — never inside agent logic.'],
  ['Smart contract is final authority', 'Backend preflight simulation is for UX only. The contract will revert any out-of-policy transaction.'],
  ['Funds locked in SentinelVault', 'USDC is held by the vault, not the agent. Owner can withdraw at any time.'],
  ['Bounded execution authority', 'Maximum loss is capped by on-chain policy. Even under full agent compromise, financial damage is contained.'],
  ['Instant human override', 'Owner can pause any agent instantly — all payments stop immediately.'],
  ['Full on-chain auditability', 'Every payment emits a verifiable on-chain event. Nothing is hidden or off-chain only.'],
];

export default function Infrastructure() {
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4 text-[11px] font-bold bg-cyan-500/[0.07] border border-cyan-500/20 text-cyan-400">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M16.24 7.76a6 6 0 0 1 0 8.49M4.93 4.93a10 10 0 0 0 0 14.14M7.76 7.76a6 6 0 0 0 0 8.49" />
            </svg>
            System Design
          </div>
          <h1 className="text-3xl font-black mb-3" style={{ fontFamily: 'var(--font-heading)' }}>Infrastructure</h1>
          <p className="text-sm leading-relaxed max-w-2xl text-slate-400">
            SentinelPay is a layered system — each tier has a single responsibility. Smart contracts enforce
            policy, the SDK handles agent integration, and the vault controls funds. No layer has more
            authority than it needs.
          </p>
        </div>

        {/* Architecture stack */}
        <div className="mb-14">
          <p className="text-[10px] font-bold font-mono uppercase tracking-widest mb-6 text-slate-600">System Architecture</p>
          <div className="flex flex-col gap-2">
            {layers.map((layer, i) => (
              <div key={i} className="flex flex-col items-center">
                <div
                  className="w-full rounded-xl p-5 flex items-start gap-4 transition-colors card-interactive border"
                  style={{
                    backgroundColor: layer.accent ? 'rgba(124,58,237,0.06)' : 'rgba(6,6,14,0.8)',
                    borderColor: layer.accent ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.07)',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: layer.accent ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.04)' }}
                  >
                    {layer.icon}
                  </div>
                  <div>
                    <div className="text-[10px] font-mono mb-0.5" style={{ color: layer.accent ? '#a78bfa' : '#4b5563' }}>
                      {layer.label}
                    </div>
                    <div className="text-sm font-semibold mb-1 text-white" style={{ fontFamily: 'var(--font-heading)' }}>{layer.title}</div>
                    <div className="text-xs leading-relaxed text-slate-500">{layer.description}</div>
                  </div>
                </div>
                {i < layers.length - 1 && (
                  <div className="w-px h-5" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Security guarantees */}
        <div className="rounded-2xl p-6 sm:p-8 border border-white/[0.07]" style={{ backgroundColor: 'rgba(6,6,14,0.8)' }}>
          <div className="text-[10px] font-bold font-mono uppercase tracking-widest mb-2 text-slate-600">
            Security Guarantees
          </div>
          <h2 className="text-xl font-black mb-6 text-white" style={{ fontFamily: 'var(--font-heading)' }}>Financial containment by design</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {guarantees.map(([title, desc]) => (
              <div key={title as string} className="flex gap-3">
                <div
                  className="w-5 h-5 rounded flex items-center justify-center text-xs mt-0.5 shrink-0 font-bold"
                  style={{ backgroundColor: 'rgba(16,185,129,0.08)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}
                >
                  ✓
                </div>
                <div>
                  <div className="text-sm font-semibold mb-1 text-white">{title}</div>
                  <div className="text-xs leading-relaxed text-slate-500">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
