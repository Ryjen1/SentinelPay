'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';

export default function Docs() {
  const explorerBaseUrl = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL ?? 'https://sepolia.celoscan.io';
  const vaultAddress = process.env.NEXT_PUBLIC_AGENT_VAULT ?? '0xb829A5A634884c34a2c8AA66a3Fd1b8DEDf9F459';
  const policyRegistryAddress = process.env.NEXT_PUBLIC_POLICY_REGISTRY ?? '0x9314E31a23E4e3A04B1Df727Fc224361270e9Fc5';
  const networkLabel = process.env.NEXT_PUBLIC_NETWORK_LABEL ?? 'Celo Sepolia Testnet';

  const codeBlockStyle = {
    backgroundColor: '#06060e',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '0.75rem',
    padding: '1.25rem',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8rem',
    color: '#d1d5db',
    overflowX: 'auto' as const,
    whiteSpace: 'pre' as const,
  };

  return (
    <main className="min-h-screen text-white" style={{ backgroundColor: 'var(--primary-bg)' }}>
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-cross-grid opacity-60" />
      </div>

      <Navbar variant="fixed" />

      <div className="relative z-10 max-w-3xl mx-auto px-8 pt-28 pb-20">
        <Link href="/" className="text-sm mb-8 block text-slate-600 hover:text-white transition-colors no-underline">
          ← Back to home
        </Link>

        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4 text-[11px] font-bold bg-violet-500/[0.07] border border-violet-500/20 text-violet-400">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
            SDK Documentation
          </div>
          <h1 className="text-4xl font-black mb-3" style={{ fontFamily: 'var(--font-heading)' }}>SDK Docs</h1>
          <p className="text-slate-400">
            Integrate SentinelPay into any Python AI agent in 3 steps.
          </p>
        </div>

        <div className="flex gap-3 mb-10">
          <a
            href="https://github.com/Code4livingg/sentinelpay"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors border border-white/[0.08] text-slate-300 hover:border-violet-500/40 hover:text-white no-underline"
            style={{ backgroundColor: '#06060e' }}
          >
            <span>⭐</span> View on GitHub
          </a>
          <span className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-white/[0.05] text-slate-500" style={{ backgroundColor: '#06060e' }}>
            v0.1.0
          </span>
        </div>

        <div className="space-y-10">
          <div>
            <h2 className="text-base font-bold mb-3 text-violet-400" style={{ fontFamily: 'var(--font-heading)' }}>Step 1 — Install</h2>
            <div style={codeBlockStyle}>pip install -e sdk/python</div>
          </div>

          <div>
            <h2 className="text-base font-bold mb-3 text-violet-400" style={{ fontFamily: 'var(--font-heading)' }}>Step 2 — Configure Backend (Operator Wallet)</h2>
            <div style={codeBlockStyle}>{`# backend/.env (operator wallet)
PRIVATE_KEY=your_operator_wallet_key
CELO_RPC=https://celo-sepolia.g.alchemy.com/v2/YOUR_API_KEY
CHAIN_ID=11142220
AGENT_VAULT_ADDRESS=0xb829A5A634884c34a2c8AA66a3Fd1b8DEDf9F459
POLICY_REGISTRY_ADDRESS=0x9314E31a23E4e3A04B1Df727Fc224361270e9Fc5
USDC_ADDRESS=0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582
MOCK_PAYMENT=false`}</div>
          </div>

          <div>
            <h2 className="text-base font-bold mb-3 text-violet-400" style={{ fontFamily: 'var(--font-heading)' }}>Step 3 — Use in your agent</h2>
            <div style={codeBlockStyle}>{`from sentinelpay import SentinelPayClient
client = SentinelPayClient("https://your-backend.example", agent_id="my_agent")

# Execute a policy-guarded payment
tx = client.execute_payment(0.50, "0xRecipient")
print(tx)
print(client.get_executions())`}</div>
          </div>

          <div>
            <h2 className="text-base font-bold mb-3 text-violet-400" style={{ fontFamily: 'var(--font-heading)' }}>Policy Rules</h2>
            <div style={codeBlockStyle}>{`# Register agent with spending policy
registry.registerAgent(
  agentId,
  maxPerTx=1_000_000,   # 1 USDC (6 decimals)
  dailyCap=5_000_000,   # 5 USDC per day
  whitelist=["0xRecipient1", "0xRecipient2"]
)`}</div>
          </div>

          <div
            className="rounded-xl p-6 border border-white/[0.07]"
            style={{ backgroundColor: '#06060e' }}
          >
            <h2 className="text-base font-bold mb-4" style={{ fontFamily: 'var(--font-heading)' }}>Contracts ({networkLabel})</h2>
            <div className="space-y-3 text-sm font-mono">
              {[
                { label: 'SentinelVault', address: vaultAddress, href: `${explorerBaseUrl}/address/${vaultAddress}#code` },
                { label: 'PolicyRegistry', address: policyRegistryAddress, href: `${explorerBaseUrl}/address/${policyRegistryAddress}#code` },
                { label: 'USDC (ERC-20)', address: '0x41E9...7582', href: undefined },
              ].map(({ label, address, href }) => (
                <div key={label} className="flex justify-between items-center py-2 border-b border-white/[0.05] last:border-0">
                  <span className="text-slate-500">{label}</span>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 transition-colors no-underline">
                      {`${address.slice(0, 6)}...${address.slice(-4)}`}
                    </a>
                  ) : (
                    <span className="text-slate-400">{address}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-base font-bold mb-4" style={{ fontFamily: 'var(--font-heading)' }}>Architecture</h2>
            <div className="rounded-xl p-6 border border-white/[0.07]" style={{ backgroundColor: '#06060e' }}>
              <div className="flex flex-col items-center gap-0 font-mono text-sm">
                {[
                  { label: 'User / Operator', title: '👤 Owner Wallet', note: 'Sets policy, funds vault', accent: false },
                  { label: 'Smart Contract', title: '🛡️ SentinelVault.sol', note: 'Enforces policy, holds USDC', accent: true },
                  { label: 'Smart Contract', title: '📋 PolicyRegistry.sol', note: 'Stores spending rules per agent', accent: true },
                  { label: 'Token', title: '💵 USDC (ERC-20)', note: networkLabel, accent: false },
                  { label: 'AI Agent', title: '🤖 Python SDK', note: 'Calls backend /execute-payment', accent: false },
                  { label: 'Paid Service', title: '🌐 API Provider', note: 'Optional: returns data after payment proof', accent: false },
                ].map(({ label, title, note, accent }, i, arr) => (
                  <div key={i} className="flex flex-col items-center w-full">
                    <div
                      className="w-full rounded-lg px-6 py-3 text-center"
                      style={{
                        backgroundColor: accent ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.03)',
                        border: accent ? '1px solid rgba(124,58,237,0.3)' : '1px solid rgba(255,255,255,0.07)',
                      }}
                    >
                      <div className="text-[10px] mb-1" style={{ color: accent ? '#a78bfa' : '#4b5563' }}>{label}</div>
                      <div className="font-semibold text-sm text-white">{title}</div>
                      <div className="text-[11px] text-slate-500">{note}</div>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="text-slate-700 my-1 text-xs">↓</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
