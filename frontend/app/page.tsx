'use client';

import { useEffect, useRef, useState } from 'react';
// useState still used for feed
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import LogoSVG from '@/components/LogoSVG';
// LogoSVG used in hero eyebrow and footer

type FeedEntry = {
  id: string;
  status: 'pass' | 'fail';
  agent: string;
  amount: string;
  reason: string;
  tx_url?: string;
};

type ExecutionApiRow = {
  agent_id?: string;
  amount_usdc?: number | string;
  status?: string;
  block_reason?: string | null;
  tx_hash?: string;
  tx_url?: string;
};

export default function Home() {
  const networkLabel = process.env.NEXT_PUBLIC_NETWORK_LABEL ?? 'Celo Sepolia Testnet';
  const explorerBaseUrl = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL ?? 'https://sepolia.celoscan.io';
  const backendBaseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
  const vaultAddress = process.env.NEXT_PUBLIC_AGENT_VAULT;
  const policyRegistryAddress =
    process.env.NEXT_PUBLIC_POLICY_REGISTRY ?? '0x9c4b1Df4e663cE12ad58a46B928A08D2c846317B';

  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const loadExecutions = async () => {
      try {
        const res = await fetch(`${backendBaseUrl}/executions?limit=8`, { cache: 'no-store' });
        if (!res.ok) { if (active) setFeed([]); return; }
        const payload = await res.json();
        const rows = Array.isArray(payload?.executions) ? payload.executions as ExecutionApiRow[] : [];
        const mapped = rows.slice(0, 8).map((row, idx) => {
          const amountRaw = typeof row.amount_usdc === 'number' ? row.amount_usdc : Number(row.amount_usdc);
          const amount = Number.isFinite(amountRaw) ? amountRaw.toFixed(3) : '0.000';
          const pass = row.status === 'success';
          return {
            id: row.tx_hash || `row-${idx}`,
            status: pass ? 'pass' : 'fail',
            agent: row.agent_id || 'unknown_agent',
            amount,
            reason: pass ? 'on-chain settlement confirmed' : (row.block_reason || row.status || 'execution blocked'),
            tx_url: row.tx_url,
          } as FeedEntry;
        });
        if (active) setFeed(mapped);
      } catch { if (active) setFeed([]); }
    };
    loadExecutions();
    const iv = setInterval(loadExecutions, 8000);
    return () => { active = false; clearInterval(iv); };
  }, [backendBaseUrl]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [feed]);

  // typewriter removed — tagline is static

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ backgroundColor: 'var(--primary-bg)', color: '#ffffff' }}>

      {/* ── Background layers ── */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-cross-grid opacity-100" />
        <div className="absolute inset-0 hero-glow" />
      </div>

      <Navbar variant="fixed" />

      {/* ═══════════════════════════════════════════
          HERO
      ═══════════════════════════════════════════ */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center text-center px-6 pt-16 pb-20">

        {/* Radial glow behind content */}
        <div className="absolute inset-x-0 top-0 h-full hero-glow-purple pointer-events-none" />

        {/* Logo + Brand name — like "= SOLANA" in sendai.fun */}
        <div className="fade-in-up flex items-center gap-3 mb-12 mt-12 w-full justify-center">
          <LogoSVG variant="mono" width={22} height={22} className="text-slate-400" />
          <span
            className="text-slate-400 tracking-[0.18em]"
            style={{ fontFamily: 'var(--font-display)', fontSize: '0.5rem' }}
          >
            SENTINELPAY
          </span>
        </div>

        {/* Main heading — Press Start 2P, like "AGENT KIT" */}
        <h1
          className="fade-in-up delay-100 leading-snug mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.8rem, 5.5vw, 4.2rem)',
            color: 'white',
            letterSpacing: '0.04em',
          }}
        >
          <span className="text-white">GUARDIAN</span>
          <br />
          <span className="text-slate-500">PROTOCOL</span>
        </h1>

        {/* Tagline */}
        <div className="fade-in-up delay-200 flex flex-col items-center justify-center gap-2 mb-20">
          <span className="text-slate-400 font-mono tracking-widest text-sm text-center">
            Connect any AI Agents to Celo Protocols
          </span>
          <span className="text-slate-500 font-mono text-xs text-center opacity-80">
            Policy-enforced guardrails for autonomous AI agents
          </span>
        </div>

        {/* CTAs — sendai.fun bordered outline style */}
        <div className="fade-in-up delay-300 flex flex-wrap gap-4 justify-center mb-16">
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-2.5 px-7 py-3.5 rounded-sm font-semibold text-sm text-white no-underline transition-all duration-200 hover:bg-white/[0.08]"
            style={{
              border: '1px solid rgba(255,255,255,0.65)',
              fontFamily: 'var(--font-display)',
              fontSize: '0.6rem',
              letterSpacing: '0.08em',
            }}
          >
            Dashboard
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/demo"
            className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-sm font-semibold text-sm text-white no-underline transition-all duration-200 hover:bg-white/[0.08]"
            style={{
              border: '1px solid rgba(255,255,255,0.65)',
              fontFamily: 'var(--font-display)',
              fontSize: '0.6rem',
              letterSpacing: '0.08em',
            }}
          >
            Live Demo
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
            </svg>
          </Link>
        </div>

        {/* Scroll indicator */}
        <div className="fade-in-up delay-400 flex flex-col items-center gap-2 text-slate-700">
          <div className="w-px h-8 bg-gradient-to-b from-slate-600 to-transparent" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          PROTOCOL STRIP
      ═══════════════════════════════════════════ */}
      <div className="relative z-10 border-y border-white/[0.05]" style={{ backgroundColor: 'rgba(10,10,18,0.6)' }}>
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-wrap items-center justify-center gap-6 md:gap-16">
          {[
            'Policy Registry',
            'Celo Network',
            'USDC Settlement',
            'On-Chain Policy',
            'Zero Trust Architecture',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2.5 group cursor-default">
              <div className="w-1 h-1 rounded-full bg-cyan-500/40 group-hover:bg-cyan-400 transition-colors duration-200" />
              <span className="text-[10px] font-bold font-mono uppercase tracking-[0.2em] text-slate-500 group-hover:text-slate-300 transition-colors duration-200">
                {item}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          STATS
      ═══════════════════════════════════════════ */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-24">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 rounded-2xl overflow-hidden border border-white/[0.06]" style={{ backgroundColor: 'rgba(10,10,18,0.7)' }}>
          {[
            { value: '$0.001', label: 'Per API Call', note: 'Micro-payment native · USDC' },
            { value: '<2s', label: 'Settlement Time', note: 'Celo block time ~1s' },
            { value: '100%', label: 'On-Chain Enforced', note: 'Zero off-chain trust' },
          ].map(({ value, label, note }, i) => (
            <div
              key={label}
              className={`px-10 py-10 text-center sm:text-left ${i < 2 ? 'border-b sm:border-b-0 sm:border-r border-white/[0.06]' : ''}`}
            >
              <div
                className="text-4xl sm:text-5xl font-black mb-2 text-transparent bg-clip-text"
                style={{ fontFamily: 'var(--font-heading)', backgroundImage: 'linear-gradient(135deg, #06b6d4, #2563eb)' }}
              >
                {value}
              </div>
              <div className="text-sm font-semibold mb-1 text-white">{label}</div>
              <div className="text-xs font-mono text-slate-500">{note}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          HOW IT WORKS
      ═══════════════════════════════════════════ */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-16 border-t border-white/[0.05]">
        <div className="text-center mb-16">
          <p className="text-[10px] font-bold font-mono uppercase tracking-[0.3em] text-cyan-400 mb-3">
            Implementation Workflow
          </p>
          <h2
            className="text-3xl md:text-5xl font-black tracking-tight mb-4"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Three Steps to Safety
          </h2>
          <p className="text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
            Protecting your assets shouldn&apos;t be complex. SentinelPay integrates in minutes, not days.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              n: '01',
              title: 'Human Sets Policy',
              desc: 'Owner registers spending limits and recipient whitelist in PolicyRegistry; funds remain in the vault with owner pause/withdraw controls.',
              color: 'rgba(6,182,212,0.08)',
              borderColor: 'rgba(6,182,212,0.2)',
              accentColor: '#06b6d4',
              icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-15v10m-3-3h6',
            },
            {
              n: '02',
              title: 'Agent Requests Pay',
              desc: 'The agent requests payment via SDK; backend validates (optional HMAC/idempotency) and submits with the operator wallet.',
              color: 'rgba(124,58,237,0.08)',
              borderColor: 'rgba(124,58,237,0.2)',
              accentColor: '#7c3aed',
              icon: 'M20 7h-9m0 0l3 3m-3-3l3-3M4 17h9m0 0l-3 3m3-3l-3-3',
            },
            {
              n: '03',
              title: 'On-Chain Validation',
              desc: 'SentinelVault validates the intent against registered policy on-chain. Out-of-policy requests are atomically reverted.',
              color: 'rgba(6,182,212,0.08)',
              borderColor: 'rgba(6,182,212,0.2)',
              accentColor: '#06b6d4',
              icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
            },
            {
              n: '04',
              title: 'Instant Settlement',
              desc: 'USDC moves from vault to recipient. A PaymentExecuted event is emitted; paid APIs can verify by tx hash.',
              color: 'rgba(16,185,129,0.08)',
              borderColor: 'rgba(16,185,129,0.2)',
              accentColor: '#10b981',
              icon: 'M22 11.08V12a10 10 0 1 1-5.93-9.14m5.21-.19L12 14.28 9.5 11.77',
            },
          ].map(({ n, title, desc, color, borderColor, accentColor, icon }) => (
            <div
              key={n}
              className="group card-interactive rounded-2xl p-8 border relative overflow-hidden flex flex-col"
              style={{ backgroundColor: color, borderColor }}
            >
              <div className="absolute top-0 right-0 p-5 opacity-[0.04] text-7xl font-black font-mono group-hover:opacity-[0.08] transition-opacity" style={{ fontFamily: 'var(--font-heading)' }}>
                {n}
              </div>
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-110"
                style={{ backgroundColor: `${accentColor}18`, border: `1px solid ${accentColor}35` }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={icon} />
                </svg>
              </div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-widest mb-2" style={{ color: accentColor }}>
                Step {n}
              </div>
              <h3 className="text-base font-bold text-white mb-3" style={{ fontFamily: 'var(--font-heading)' }}>{title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          LIVE MONITOR
      ═══════════════════════════════════════════ */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-24 border-t border-white/[0.05]">
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-14 items-start">

          {/* Left copy */}
          <div className="xl:col-span-2">
            <p className="text-[10px] font-bold font-mono uppercase tracking-[0.3em] text-cyan-400 mb-3">
              Global Telemetry
            </p>
            <h2
              className="text-3xl md:text-4xl font-black tracking-tight text-white mb-4"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Real-time Operations Monitor
            </h2>
            <p className="text-base text-slate-400 leading-relaxed mb-10">
              Execution results are recorded by the backend and linked to on-chain transactions. Watch the execution feed live.
            </p>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <div className="text-3xl font-black text-white mb-1" style={{ fontFamily: 'var(--font-heading)' }}>3,402+</div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Secure TXs</div>
              </div>
              <div>
                <div className="text-3xl font-black text-white mb-1" style={{ fontFamily: 'var(--font-heading)' }}>&lt;2s</div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Latency</div>
              </div>
            </div>
          </div>

          {/* Right feed */}
          <div className="xl:col-span-3">
            <div className="w-full rounded-2xl overflow-hidden border border-white/[0.06] shadow-2xl relative" style={{ backgroundColor: 'rgba(10,10,18,0.8)' }}>
              {/* Terminal chrome */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.05]" style={{ backgroundColor: 'rgba(5,5,12,0.8)' }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                  <span className="text-[10px] font-bold font-mono tracking-widest text-emerald-400 uppercase">
                    Awaiting execution logs...
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
                    <div key={c} className="w-2.5 h-2.5 rounded-full opacity-40" style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>

              {/* Table header */}
              <div
                className="grid px-5 py-2 text-[10px] font-bold font-mono tracking-widest text-slate-600 border-b border-white/[0.03]"
                style={{ gridTemplateColumns: '80px 140px 100px 1fr 32px' }}
              >
                <span>VERDICT</span>
                <span>ENTITY</span>
                <span>VALUE</span>
                <span>METADATA</span>
                <span />
              </div>

              {/* Feed rows */}
              <div ref={feedRef} className="scrollbar-hidden" style={{ height: '280px', overflowY: 'auto' }}>
                {feed.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                    <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
                      </svg>
                    </div>
                    <div className="text-xs text-slate-600 font-mono">No events yet — backend offline or idle</div>
                  </div>
                ) : (
                  feed.map((entry) => (
                    <div
                      key={entry.id}
                      className="grid px-5 py-4 text-xs font-mono items-center hover:bg-white/[0.02] transition-colors border-b border-white/[0.03]"
                      style={{ gridTemplateColumns: '80px 140px 100px 1fr 32px' }}
                    >
                      <span className="font-bold" style={{ color: entry.status === 'pass' ? '#10b981' : '#f43f5e' }}>
                        {entry.status === 'pass' ? '✓ PASS' : '✗ FAIL'}
                      </span>
                      <span className="text-slate-300 truncate pr-4">{entry.agent}</span>
                      <span className="text-white font-bold">
                        {entry.amount} <span className="text-[10px] text-slate-500">USDC</span>
                      </span>
                      <span className="text-slate-500 truncate italic pr-4">{entry.reason}</span>
                      {entry.tx_url ? (
                        <a href={entry.tx_url} target="_blank" rel="noopener noreferrer" className="flex justify-end text-slate-600 hover:text-cyan-400 transition-colors">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M7 17l9.2-9.2M17 17V7H7" />
                          </svg>
                        </a>
                      ) : (
                        <div className="flex justify-end">
                          <div className="w-1.5 h-1.5 rounded-full opacity-30" style={{ backgroundColor: entry.status === 'pass' ? '#10b981' : '#f43f5e' }} />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          SECURITY GUARANTEE
      ═══════════════════════════════════════════ */}
      <section className="relative z-10 border-t border-white/[0.05]" style={{ backgroundColor: 'rgba(10,10,18,0.5)' }}>
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

            {/* Left: guarantee list */}
            <div>
              <p className="text-[10px] font-bold font-mono uppercase tracking-[0.3em] text-slate-500 mb-3">
                The Policy Guarantee
              </p>
              <h2
                className="text-2xl sm:text-3xl font-black mb-3"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Financial containment<br />by design
              </h2>
              <p className="text-sm leading-relaxed mb-10 text-slate-500">
                SentinelPay doesn&apos;t ask agents to behave. The contract makes misbehavior
                physically impossible — even under full agent compromise.
              </p>
              <div className="space-y-4">
                {[
                  ['Agent never holds private keys', 'Signing always happens at the operator wallet. Agent code is stateless.'],
                  ['Smart contract is final authority', 'SDK pre-checks are for UX. The contract will revert any violation.'],
                  ['Funds locked in SentinelVault', 'USDC sits in the vault, not in agent memory. Owner withdraws at will.'],
                  ['Maximum loss is bounded', 'Even full compromise caps damage to the on-chain policy limits.'],
                  ['Instant human override', 'Owner pauses any agent in one transaction. All payments halt immediately.'],
                  ['Full on-chain audit trail', 'Every payment emits a verifiable event. Nothing is off-chain only.'],
                ].map(([title, desc]) => (
                  <div key={title as string} className="flex gap-3 items-start group">
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center text-xs mt-0.5 shrink-0 font-bold transition-colors"
                      style={{ backgroundColor: 'rgba(16,185,129,0.08)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}
                    >
                      ✓
                    </div>
                    <div>
                      <div className="text-sm font-semibold mb-0.5 text-slate-100">{title}</div>
                      <div className="text-xs leading-relaxed text-slate-500">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Solidity code */}
            <div className="lg:pt-12">
              <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#040408', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: '#030307' }}>
                  <div className="flex gap-1.5">
                    {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
                      <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c, opacity: 0.6 }} />
                    ))}
                  </div>
                  <span className="text-[10px] font-mono" style={{ color: '#2D3748' }}>SentinelVault.sol — enforcement logic</span>
                  <div />
                </div>
                <pre className="p-5 text-xs overflow-x-auto leading-relaxed" style={{ fontFamily: 'var(--font-mono)', color: '#6B7280' }}>
                  <code>{`function executePayment(
  bytes32 agentId,
  address recipient,
  uint256 amount
) external onlyOwner {
  PolicyRegistry.Policy memory p =
    policyRegistry.getPolicy(agentId);

  // ① Per-transaction cap
  require(amount <= p.maxPerTx,
    "Exceeds per-tx limit");

  // ② Recipient whitelist
  require(policyRegistry.isWhitelisted(
    agentId, recipient),
    "Recipient not whitelisted");

  // ③ Rolling daily budget
  require(
    dailySpent[agentId] + amount <= p.dailyCap,
    "Exceeds daily cap"
  );

  dailySpent[agentId] += amount;
  IERC20(USDC).transfer(recipient, amount);

  emit PaymentExecuted(   // ← fully auditable
    agentId, recipient, amount, block.timestamp
  );
}`}</code>
                </pre>
              </div>
              <p className="mt-3 text-[10px] text-center text-slate-600 font-mono">
                Three checks. One revert. Zero discretion.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          SDK INTEGRATION
      ═══════════════════════════════════════════ */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-center">
          <div className="lg:col-span-2">
            <p className="text-[10px] font-bold font-mono uppercase tracking-[0.3em] text-slate-500 mb-3">
              3-Line Integration
            </p>
            <h2
              className="text-2xl sm:text-3xl font-black mb-4"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Add SentinelPay to any<br />Python AI agent
            </h2>
            <p className="text-sm leading-relaxed mb-8 text-slate-500">
              Install the SDK, point it at your backend, and every payment your agent
              makes is automatically policy-guarded — no extra code required.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors no-underline"
              >
                Read the full SDK docs
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-200 transition-colors no-underline"
              >
                Run the live demo →
              </Link>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#040408', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: '#030307' }}>
                <div className="flex gap-1.5">
                  {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
                    <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c, opacity: 0.6 }} />
                  ))}
                </div>
                <span className="text-[10px] font-mono" style={{ color: '#2D3748' }}>agent.py</span>
                <div />
              </div>
              <pre className="p-5 text-xs leading-relaxed overflow-x-auto" style={{ fontFamily: 'var(--font-mono)', color: '#6B7280' }}>
                <code>
                  <span style={{ color: '#22d3ee' }}># Install the SDK{'\n'}</span>
                  <span style={{ color: '#9CA3AF' }}>pip install sentinelpay{'\n\n'}</span>
                  <span style={{ color: '#22d3ee' }}># Initialize the secure client{'\n'}</span>
                  <span style={{ color: '#9CA3AF' }}>from sentinelpay import SentinelPayClient{'\n\n'}</span>
                  <span style={{ color: '#9CA3AF' }}>client = SentinelPayClient({'\n'}</span>
                  <span style={{ color: '#9CA3AF' }}>{'  '}vault_address=<span style={{ color: '#86efac' }}>&quot;0x8C...F2&quot;</span>,{'\n'}</span>
                  <span style={{ color: '#9CA3AF' }}>{'  '}policy_id=<span style={{ color: '#fbbf24' }}>1</span>{'\n'}</span>
                  <span style={{ color: '#9CA3AF' }}>){'\n\n'}</span>
                  <span style={{ color: '#22d3ee' }}># This call is policy-checked on-chain{'\n'}</span>
                  <span style={{ color: '#9CA3AF' }}>client.transfer(to=<span style={{ color: '#86efac' }}>&quot;0x...&quot;</span>, amount=<span style={{ color: '#fbbf24' }}>10.0</span>)</span>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          CTA
      ═══════════════════════════════════════════ */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 py-16">
        <div
          className="rounded-2xl p-10 sm:p-16 text-center relative overflow-hidden"
          style={{
            backgroundColor: '#04040a',
            border: '1px solid rgba(6,182,212,0.2)',
            boxShadow: '0 0 80px rgba(6,182,212,0.06) inset',
          }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.12) 0%, transparent 65%)' }} />
          <div className="relative z-10">
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-500 mb-4">
              Ready to guard your agents?
            </p>
            <h2
              className="text-3xl sm:text-4xl font-black mb-4 text-white"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Start building with SentinelPay
            </h2>
            <p className="text-sm sm:text-base mb-10 max-w-md mx-auto text-slate-500">
              Deploy your first policy-guarded agent on Celo in under five minutes.
              No custodian. No permission. Fully on-chain.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/dashboard"
                className="btn-primary inline-flex items-center gap-2 px-8 py-3.5 rounded-lg text-sm font-bold no-underline"
              >
                Open Dashboard
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/docs"
                className="btn-outline inline-flex items-center gap-2 px-8 py-3.5 rounded-lg text-sm font-medium no-underline"
              >
                Read the SDK docs
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          FOOTER
      ═══════════════════════════════════════════ */}
      <footer className="relative z-10 border-t border-white/[0.05]">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <LogoSVG variant="mono" width={18} height={18} className="text-cyan-400" />
                <span className="font-semibold text-sm text-white" style={{ fontFamily: 'var(--font-heading)' }}>SentinelPay</span>
              </div>
              <p className="text-xs leading-relaxed mb-4 text-slate-600">
                Policy-enforced payment infrastructure for autonomous AI agents on Celo.
                Built for hackathon. Designed for production.
              </p>
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-400" />
                Deployed on {networkLabel}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold mb-4 uppercase tracking-widest text-slate-600">Resources</div>
              <div className="space-y-2.5">
                {[
                  { label: 'SentinelVault Contract ↗', href: `${explorerBaseUrl}/address/${vaultAddress}#code` },
                  { label: 'PolicyRegistry ↗', href: `${explorerBaseUrl}/address/${policyRegistryAddress}#code` },
                  { label: 'GitHub Repository ↗', href: process.env.NEXT_PUBLIC_GITHUB_URL ?? '#' },
                ].map(({ label, href }) => (
                  <div key={label}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-600 hover:text-violet-400 transition-colors"
                    >
                      {label}
                    </a>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold mb-4 uppercase tracking-widest text-slate-600">Pages</div>
              <div className="space-y-2.5">
                {[
                  { label: 'Dashboard', href: '/dashboard' },
                  { label: 'Live Demo', href: '/demo' },
                  { label: 'SDK Docs', href: '/docs' },
                  { label: 'Infrastructure', href: '/infrastructure' },
                  { label: 'Roadmap', href: '/roadmap' },
                ].map(({ label, href }) => (
                  <div key={label}>
                    <Link href={href} className="text-xs text-slate-600 hover:text-violet-400 transition-colors no-underline">
                      {label}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-10 pt-6 text-[10px] text-center font-mono text-slate-700" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            &copy; 2026 SentinelPay &nbsp;·&nbsp; Built for Celo Hackathon &nbsp;·&nbsp; Zero trust, by design
          </div>
        </div>
      </footer>
    </div>
  );
}
