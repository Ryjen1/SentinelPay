'use client';

import { useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

type LogLevel = 'info' | 'success' | 'error' | 'muted' | 'warning';

type LogLine = {
  id: number;
  text: string;
  level: LogLevel;
};

type DemoExecuteResponse = {
  tx_hash?: string;
  tx_url?: string;
  agent_id?: string;
  recipient?: string;
  amount_usdc?: number;
  chain_id?: number;
  error?: string;
  detail?: { error?: string } | string;
};

type HealthResponse = {
  status?: string;
  network?: string;
  database?: string;
  mock_mode?: boolean;
  operator_auth_required?: boolean;
  idempotency_key_required?: boolean;
  agent_signature_required?: boolean;
  payment_worker_enabled?: boolean;
  payment_worker_running?: boolean;
  dead_letter_count_probe?: number;
};

type NetworkInfoResponse = {
  chain?: string;
  chain_id?: number;
  why_celo?: string;
};

type VaultBalanceResponse = {
  balance_usdc?: string;
  error?: string;
};

type ExecutionRow = {
  agent_id?: string;
  recipient?: string;
  amount_usdc?: number | string;
  tx_hash?: string;
  status?: string;
  block_reason?: string | null;
  block_number?: number;
  gas_used?: number;
  tx_url?: string;
};

type ExecutionsResponse = {
  executions?: ExecutionRow[];
};

function extractErrorMessage(payload: DemoExecuteResponse | null): string {
  if (!payload) return 'Request failed with empty response';
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  if (typeof payload.detail === 'string' && payload.detail.trim()) return payload.detail;
  if (payload.detail && typeof payload.detail === 'object' && typeof payload.detail.error === 'string') {
    return payload.detail.error;
  }
  return 'Execution failed';
}

export default function Demo() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [runStatus, setRunStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [lastTxUrl, setLastTxUrl] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [lastMeta, setLastMeta] = useState<{
    amount?: number;
    recipient?: string;
    agentId?: string;
    chainId?: number;
    blockNumber?: number;
    gasUsed?: number;
  } | null>(null);
  const agentId = process.env.NEXT_PUBLIC_AGENT_ID ?? 'weather_agent';
  const backendBaseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');

  const appendLog = (text: string, level: LogLevel = 'info') => {
    setLogs(prev => [...prev, { id: Date.now() + prev.length, text, level }]);
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const safeJson = async <T,>(res: Response): Promise<T | null> => {
    try {
      return (await res.json()) as T;
    } catch {
      return null;
    }
  };

  const runDemo = async () => {
    setLogs([]);
    setDone(false);
    setRunStatus('idle');
    setRunning(true);
    setLastTxUrl(null);
    setLastTxHash(null);
    setLastMeta(null);
 
    try {
      appendLog('> Bootstrapping SentinelPay demo runtime...', 'info');
      await sleep(500);
      appendLog(`> Backend: ${backendBaseUrl}`, 'muted');
      await sleep(450);

      const [healthRes, networkRes, vaultRes] = await Promise.all([
        fetch(`${backendBaseUrl}/health`, { cache: 'no-store' }),
        fetch(`${backendBaseUrl}/network-info`, { cache: 'no-store' }),
        fetch(`${backendBaseUrl}/vault-balance`, { cache: 'no-store' }),
      ]);

      const health = healthRes.ok ? await safeJson<HealthResponse>(healthRes) : null;
      const network = networkRes.ok ? await safeJson<NetworkInfoResponse>(networkRes) : null;
      const vault = vaultRes.ok ? await safeJson<VaultBalanceResponse>(vaultRes) : null;

      if (health) {
        appendLog(
          `> Health: ${health.status ?? 'ok'} | DB=${health.database ?? 'n/a'} | Worker=${health.payment_worker_enabled ? 'on' : 'off'}`,
          'success'
        );
      } else {
        appendLog('> Health: unavailable (check backend)', 'warning');
      }

      if (network) {
        appendLog(`> Network: ${network.chain ?? 'Celo'} (chainId ${network.chain_id ?? 'n/a'})`, 'info');
      }

      if (vault?.balance_usdc) {
        appendLog(`> Vault balance: ${vault.balance_usdc} USDC`, 'success');
      } else {
        appendLog('> Vault balance: unavailable', 'warning');
      }

      await sleep(600);
      appendLog(`> Dispatching /execute-demo for agent "${agentId}"...`, 'info');
      await sleep(700);

      // Perform real execution
      const res = await fetch('/api/demo-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      });
      
      const data: DemoExecuteResponse = await res.json().catch(() => null);
      const errorMsg = extractErrorMessage(data);

      if (!res.ok || !data?.tx_hash) {
        appendLog('> Policy engine blocked the request.', 'error');
        await sleep(600);
        appendLog(`> Reason: ${errorMsg}`, 'error');
        await sleep(500);
        appendLog('---', 'muted');
        appendLog('> Session complete.', 'info');
        setRunStatus('error');
        setDone(true);
        return;
      }

      const amountValue = typeof data.amount_usdc === 'number' ? data.amount_usdc : Number(data.amount_usdc);
      const amountText = Number.isFinite(amountValue) ? amountValue.toFixed(3) : 'n/a';
      const recipientText = data.recipient ?? 'unknown';
      const chainIdText = data.chain_id ?? network?.chain_id ?? 'n/a';

      appendLog(`> Payment authorized by SentinelVault`, 'success');
      await sleep(600);
      appendLog(`> Agent: ${data.agent_id ?? agentId}`, 'info');
      await sleep(450);
      appendLog(`> Amount: ${amountText} USDC`, 'info');
      await sleep(450);
      appendLog(`> Recipient: ${recipientText}`, 'info');
      await sleep(600);
      appendLog(`> Chain ID: ${chainIdText}`, 'muted');
      await sleep(600);
      appendLog(`> Tx confirmed: ${data.tx_hash}`, 'success');

      setLastTxHash(data.tx_hash);
      setLastTxUrl(data.tx_url || null);
      setLastMeta({
        amount: Number.isFinite(amountValue) ? amountValue : undefined,
        recipient: data.recipient,
        agentId: data.agent_id ?? agentId,
        chainId: typeof chainIdText === 'number' ? chainIdText : undefined,
      });

      await sleep(600);
      if (data.tx_url) {
        appendLog(`> Explorer: ${data.tx_url}`, 'muted');
      }

      const execRes = await fetch(`${backendBaseUrl}/executions?limit=1`, { cache: 'no-store' }).catch(() => null);
      if (execRes && execRes.ok) {
        const execPayload = await safeJson<ExecutionsResponse>(execRes);
        const latest = execPayload?.executions?.[0];
        if (latest?.tx_hash === data.tx_hash) {
          const gasUsed = latest.gas_used ?? 0;
          const blockNumber = latest.block_number ?? 0;
          appendLog(`> DB: stored (block ${blockNumber}, gas ${gasUsed})`, 'success');
          setLastMeta(prev => prev ? { ...prev, blockNumber, gasUsed } : prev);
        }
      }

      await sleep(600);
      appendLog('---', 'muted');
      appendLog('> Session complete.', 'info');
      setRunStatus('success');
      setDone(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      appendLog(`> [FAILURE] Guardian runtime error: ${message}`, 'error');
      await sleep(1500);
      appendLog(`---`, 'muted');
      appendLog(`> Session complete.`, 'info');
      setRunStatus('error');
      setDone(true);
    } finally {
      setRunning(false);
    }
  };

  const logColor = (level: LogLevel) => {
    if (level === 'error') return '#f87171';
    if (level === 'success') return '#4ade80';
    if (level === 'warning') return '#facc15'; // Vibrant Yellow/Gold for Final Answer
    if (level === 'muted') return '#475569';
    return '#E2E8F0'; // White/Light Grey for standard logs
  };

  return (
    <main className="min-h-screen text-white" style={{ backgroundColor: 'var(--primary-bg)' }}>
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-cross-grid opacity-70" />
      </div>

      <Navbar variant="fixed" />

      <div className="relative z-10 max-w-4xl mx-auto px-6 pt-28 pb-20">
        <Link href="/" className="text-sm mb-8 block text-slate-600 hover:text-white transition-colors no-underline">
          ← Back to home
        </Link>

        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4 text-[11px] font-bold bg-cyan-500/[0.07] border border-cyan-500/20 text-cyan-400">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Live On-Chain Execution
          </div>
          <h1 className="text-3xl font-black mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
            SentinelPay Live Demo
          </h1>
          <p className="text-sm leading-relaxed max-w-xl text-slate-400">
            Run a real <code className="text-cyan-400 text-xs">/execute-demo</code> call against your backend and watch the returned transaction hash and
            explorer URL in real time.
          </p>
        </div>

        {/* Terminal */}
        <div
          className="rounded-2xl overflow-hidden mb-6 border border-white/[0.07]"
          style={{ backgroundColor: '#06060e' }}
        >
          {/* Chrome */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]"
            style={{ backgroundColor: '#040408' }}
          >
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#FF5F57' }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#FEBC2E' }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#28C840' }} />
            </div>
            <span className="text-[10px] font-mono text-slate-600">
              sentinelpay-live — demo session
            </span>
            <div className="w-16" />
          </div>

          {/* Log output */}
          <div
            className="p-5 min-h-64 max-h-96 overflow-y-auto"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', lineHeight: '1.8' }}
          >
            {logs.length === 0 && !running && (
              <span className="text-slate-700">
                {'// Click "Run Demo" to execute a real backend payment call'}
              </span>
            )}
            {logs.map(line => (
              <div key={line.id} style={{ color: logColor(line.level) }}>
                {line.text}
              </div>
            ))}
            {running && (
              <span className="cursor-blink text-violet-400">▋</span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={runDemo}
            disabled={running}
            className="btn-primary inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Running…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 3l14 9-14 9V3z" />
                </svg>
                {done ? 'Run Again' : 'Run Demo'}
              </>
            )}
          </button>

          {done && (
            <div
              className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border ${
                runStatus === 'error'
                  ? 'bg-rose-500/[0.07] border-rose-500/20 text-rose-300'
                  : 'bg-emerald-500/[0.07] border-emerald-500/20 text-emerald-400'
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  runStatus === 'error' ? 'bg-rose-400' : 'bg-emerald-400'
                }`}
              />
              {runStatus === 'error' ? 'Run blocked by policy' : 'Live run complete'}
            </div>
          )}
        </div>

        {lastTxHash && (
          <div className="rounded-xl p-4 text-xs border border-white/[0.07]" style={{ backgroundColor: '#06060e' }}>
            <div className="text-slate-500 mb-2">Latest transaction</div>
            <div className="font-mono text-slate-200">{lastTxHash}</div>
            {lastMeta && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-slate-500">
                {lastMeta.agentId && <div>Agent: <span className="text-slate-300">{lastMeta.agentId}</span></div>}
                {lastMeta.amount !== undefined && (
                  <div>Amount: <span className="text-slate-300">{lastMeta.amount.toFixed(3)} USDC</span></div>
                )}
                {lastMeta.recipient && (
                  <div>Recipient: <span className="text-slate-300">{lastMeta.recipient.slice(0, 10)}…</span></div>
                )}
                {lastMeta.chainId && <div>Chain ID: <span className="text-slate-300">{lastMeta.chainId}</span></div>}
                {lastMeta.blockNumber !== undefined && (
                  <div>Block: <span className="text-slate-300">{lastMeta.blockNumber}</span></div>
                )}
                {lastMeta.gasUsed !== undefined && (
                  <div>Gas Used: <span className="text-slate-300">{lastMeta.gasUsed}</span></div>
                )}
              </div>
            )}
            {lastTxUrl && (
              <a href={lastTxUrl} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-violet-400 hover:text-violet-300 transition-colors">
                Open on explorer ↗
              </a>
            )}
          </div>
        )}

        {/* Info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12">
          {[
            {
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              ),
              title: 'Live Backend Call',
              body: 'This page triggers a real POST to backend /execute-demo, then renders the actual response payload.',
            },
            {
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              ),
              title: 'On-Chain Enforcement',
              body: 'Execution goes through SentinelVault policy rules on-chain before funds move.',
            },
            {
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              ),
              title: 'USDC Settlement',
              body: 'Successful runs return tx hash + explorer URL so judges can verify settlement independently.',
            },
          ].map(({ icon, title, body }) => (
            <div
              key={title}
              className="card-interactive rounded-xl p-5 border border-white/[0.07]"
              style={{ backgroundColor: '#06060e' }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 bg-white/[0.04]">
                {icon}
              </div>
              <div className="text-sm font-semibold mb-1 text-white" style={{ fontFamily: 'var(--font-heading)' }}>{title}</div>
              <div className="text-xs leading-relaxed text-slate-500">{body}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
