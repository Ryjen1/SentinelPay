'use client';

import Link from 'next/link';

const rows = [
  { label: 'Designed for AI agents (not humans)', sentinelpay: '✅', gnosis: '❌', erc4337: '⚠️' },
  { label: 'On-chain policy enforcement', sentinelpay: '✅', gnosis: '⚠️', erc4337: '⚠️' },
  { label: 'Backend-agnostic execution', sentinelpay: '⚠️', gnosis: '❌', erc4337: '⚠️' },
  { label: 'Execution logging & audit trail', sentinelpay: '✅', gnosis: '⚠️', erc4337: '⚠️' },
  { label: 'Machine-to-machine native', sentinelpay: '✅', gnosis: '❌', erc4337: '⚠️' },
  { label: 'Celo-native', sentinelpay: '✅', gnosis: '⚠️', erc4337: '⚠️' },
];

export default function WhySentinelPay() {
  return (
    <main className="min-h-screen text-white" style={{ backgroundColor: '#030305' }}>
      <nav
        className="flex justify-between items-center px-8 py-5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <Link href="/" className="flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="whyNavGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                <stop stopColor="#7C3AED" />
                <stop offset="1" stopColor="#A78BFA" />
              </linearGradient>
            </defs>
            <path
              d="M12 2.5 L20 6 L20 14.5 C20 18.5 12 21.5 12 21.5 C12 21.5 4 18.5 4 14.5 L4 6 Z"
              stroke="url(#whyNavGrad)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path d="M12 10.5 L14.5 12 L12 13.5 L9.5 12 Z" fill="url(#whyNavGrad)" />
            <circle cx="12" cy="12" r="1.2" fill="white" opacity="0.92" />
          </svg>
          <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>SentinelPay</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="text-sm transition-colors"
            style={{ color: '#A1A8B3' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={e => (e.currentTarget.style.color = '#A1A8B3')}
          >
            Dashboard
          </Link>
          <Link
            href="/roadmap"
            className="text-sm transition-colors"
            style={{ color: '#A1A8B3' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={e => (e.currentTarget.style.color = '#A1A8B3')}
          >
            Roadmap
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-14">
        <Link
          href="/"
          className="text-sm mb-8 block transition-colors"
          style={{ color: '#6B7280' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ffffff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#6B7280')}
        >
          ← Back
        </Link>

        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded mb-4 text-xs font-medium"
          style={{ backgroundColor: '#150d2a', border: '1px solid rgba(124,58,237,0.3)', color: '#A78BFA' }}
        >
          🛡️ Competitive Analysis
        </div>
        <h1 className="text-3xl font-bold mb-3">Why SentinelPay</h1>
        <p className="mb-10 text-sm" style={{ color: '#A1A8B3' }}>
          Purpose-built for autonomous AI agents to execute policy-bound payments on-chain — not a
          general-purpose wallet solution retrofitted for agents.
        </p>

        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.07)', backgroundColor: '#0d0d12' }}
        >
          {/* Header row */}
          <div
            className="grid grid-cols-4 text-xs uppercase tracking-wide"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', color: '#6B7280' }}
          >
            <div className="p-4 font-semibold">Capability</div>
            <div className="p-4 font-semibold" style={{ color: '#A78BFA' }}>SentinelPay</div>
            <div className="p-4">Gnosis Safe Limits</div>
            <div className="p-4">ERC-4337 Paymasters</div>
          </div>

          {/* Data rows */}
          {rows.map((row, i) => (
            <div
              key={row.label}
              className="grid grid-cols-4 transition-colors"
              style={{
                borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#12121a')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <div className="p-4 text-sm" style={{ color: '#D1D5DB' }}>{row.label}</div>
              <div className="p-4 text-sm font-medium" style={{ color: '#4ADE80' }}>{row.sentinelpay}</div>
              <div className="p-4 text-sm" style={{ color: '#9CA3AF' }}>{row.gnosis}</div>
              <div className="p-4 text-sm" style={{ color: '#9CA3AF' }}>{row.erc4337}</div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 mt-5 text-xs" style={{ color: '#6B7280' }}>
          <span>✅ Full support</span>
          <span>⚠️ Partial / workaround</span>
          <span>❌ Not supported</span>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12">
          {[
            {
              title: 'Agent-First Design',
              body: 'Every API, contract method, and SDK call is designed for machine invocation — not human approval flows.',
            },
            {
              title: 'Policy Enforcement',
              body: 'On-chain policy is the source of truth. The contract reverts any policy-violating payment, deterministically.',
            },
            {
              title: 'Celo-Native',
              body: 'Low-cost, fast finality on Celo makes micro-payment agent loops economically viable at scale.',
            },
          ].map(({ title, body }) => (
            <div
              key={title}
              className="card-interactive rounded-xl p-5"
              style={{ backgroundColor: '#0d0d12', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div
                className="text-xs font-semibold mb-2"
                style={{ color: '#7C3AED' }}
              >
                ◆
              </div>
              <div className="text-sm font-semibold mb-1 text-white">{title}</div>
              <div className="text-xs leading-relaxed" style={{ color: '#6B7280' }}>{body}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
