'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';

const milestones = [
  {
    title: 'Wave 6 — First Submission',
    description:
      'Core infrastructure: SentinelVault contract, policy enforcement, execution logging, observability dashboard, AI agent integration, Python SDK, developer docs',
    status: 'done',
    tag: 'Live ✓',
  },
  {
    title: 'Wave 7 (Next)',
    description:
      'Multi-agent UX (multiple agent_ids per vault), automated event polling, SDK v0.2 with TypeScript support',
    status: 'next',
    tag: 'Planned',
  },
  {
    title: 'Wave 8',
    description:
      'Celo mainnet deployment, first external developer integrations, agent marketplace prototype',
    status: 'next',
    tag: 'Planned',
  },
  {
    title: 'Wave 9',
    description:
      'Cross-chain agent execution support, DAO-controlled policy governance, production SLA',
    status: 'next',
    tag: 'Planned',
  },
];

export default function Roadmap() {
  return (
    <main className="min-h-screen text-white" style={{ backgroundColor: 'var(--primary-bg)' }}>
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-cross-grid opacity-60" />
      </div>

      <Navbar variant="fixed" />

      <div className="relative z-10 max-w-3xl mx-auto px-6 pt-28 pb-20">
        <Link href="/" className="text-sm mb-8 block text-slate-600 hover:text-white transition-colors no-underline">
          ← Back to home
        </Link>

        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4 text-[11px] font-bold bg-emerald-500/[0.07] border border-emerald-500/20 text-emerald-400">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            Build Progress
          </div>
          <h1 className="text-3xl font-black mb-3" style={{ fontFamily: 'var(--font-heading)' }}>Roadmap</h1>
          <p className="text-sm text-slate-400">
            SentinelPay&apos;s buildathon progress and forward roadmap — starting Wave 6.
          </p>
        </div>

        <div className="space-y-0">
          {milestones.map((m, idx) => {
            const isDone = m.status === 'done';
            const isLast = idx === milestones.length - 1;
            return (
              <div key={idx} className="flex gap-5">
                {/* Timeline */}
                <div className="flex flex-col items-center">
                  <div
                    className="w-3 h-3 rounded-full mt-1.5 shrink-0 transition-all"
                    style={{
                      backgroundColor: isDone ? '#10b981' : 'transparent',
                      border: isDone ? 'none' : '1.5px solid rgba(255,255,255,0.15)',
                      boxShadow: isDone ? '0 0 10px rgba(16,185,129,0.5)' : 'none',
                    }}
                  />
                  {!isLast && (
                    <div
                      className="w-px flex-1 my-1"
                      style={{
                        backgroundColor: isDone ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                        minHeight: '2.5rem',
                      }}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="pb-8 flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <div
                      className="text-sm font-bold"
                      style={{ color: isDone ? '#10b981' : '#ffffff', fontFamily: 'var(--font-heading)' }}
                    >
                      {m.title}
                    </div>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded font-mono"
                      style={{
                        backgroundColor: isDone ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.04)',
                        color: isDone ? '#10b981' : '#475569',
                        border: `1px solid ${isDone ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.07)'}`,
                      }}
                    >
                      {m.tag}
                    </span>
                  </div>
                  <div className="text-sm leading-relaxed text-slate-500">
                    {m.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
