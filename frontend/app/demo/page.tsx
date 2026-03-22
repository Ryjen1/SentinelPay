'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useAccount, useReadContract, useSignMessage } from 'wagmi';
import { formatUnits } from 'viem';

type LogLevel = 'info' | 'success' | 'error' | 'muted' | 'warning';

type LogLine = {
  id: number;
  text: string;
  level: LogLevel;
};

type DemoExecuteResponse = {
  mode?: 'actions' | 'payment';
  tx_hash?: string;
  tx_url?: string;
  agent_id?: string;
  recipient?: string;
  amount_usdc?: number;
  chain_id?: number;
  actions?: {
    name?: string;
    result?: Record<string, unknown>;
    tx_hash?: string;
    tx_url?: string;
  }[];
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
  wallet_signature_required?: boolean;
  payment_worker_enabled?: boolean;
  payment_worker_running?: boolean;
  dead_letter_count_probe?: number;
  relayer_address?: string;
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

const DEFAULT_AGENT_ID = process.env.NEXT_PUBLIC_AGENT_ID ?? 'weather_agent';
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC as `0x${string}` | undefined;
const USDC_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

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
  const [demoMode, setDemoMode] = useState<'both' | 'weather' | 'market'>('both');
  const [useDeviceLocation, setUseDeviceLocation] = useState(true);
  const [lastMeta, setLastMeta] = useState<{
    amount?: number;
    recipient?: string;
    agentId?: string;
    chainId?: number;
    blockNumber?: number;
    gasUsed?: number;
  } | null>(null);
  const [delegationSignature, setDelegationSignature] = useState<string | null>(null);
  const [delegationData, setDelegationData] = useState<{ domain: any, message: any } | null>(null);
  const { address, isConnected } = useAccount();
  const agentId = address ? `${DEFAULT_AGENT_ID}_${address.toLowerCase()}` : DEFAULT_AGENT_ID;
  const backendBaseUrl = (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
  const demoDelayMs = Number(process.env.NEXT_PUBLIC_DEMO_DELAY_MS ?? 1000);
  const { signMessageAsync } = useSignMessage();
  const { data: walletUsdcRaw } = useReadContract({
    address: (USDC_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!USDC_ADDRESS },
  });
  const walletUsdcBalance =
    typeof walletUsdcRaw === 'bigint' ? Number(formatUnits(walletUsdcRaw, 6)).toFixed(2) : null;
  const displayAgentId = (() => {
    const parts = agentId.split('_');
    if (parts.length < 2) return agentId;
    const maybeAddress = parts[parts.length - 1];
    if (/^0x[0-9a-fA-F]{6,}$/.test(maybeAddress)) {
      const short = `${maybeAddress.slice(0, 6)}...${maybeAddress.slice(-4)}`;
      return `${parts.slice(0, -1).join('_')}_${short}`;
    }
    return agentId;
  })();

  const appendLog = (text: string, level: LogLevel = 'info') => {
    setLogs(prev => [...prev, { id: Date.now() + prev.length, text, level }]);
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, Math.max(ms, demoDelayMs)));

  const safeJson = async <T,>(res: Response): Promise<T | null> => {
    try {
      return (await res.json()) as T;
    } catch {
      return null;
    }
  };

  const requestDeviceLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      return Promise.resolve(null as { lat: number; lon: number } | null);
    }
    return new Promise<{ lat: number; lon: number } | null>(resolve => {
      navigator.geolocation.getCurrentPosition(
        position => {
          resolve({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
        },
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
      );
    });
  };

  const buildWalletMessage = (walletAddress: string, timestamp: string) => {
    return [
      'SentinelPay Demo Authorization',
      `Address: ${walletAddress}`,
      `AgentId: ${agentId}`,
      `Timestamp: ${timestamp}`,
      'Path: /execute-demo',
    ].join('\n');
  };

  // Sync delegation from localStorage whenever address changes
  useEffect(() => {
    if (typeof window !== 'undefined' && address) {
      const savedSig = localStorage.getItem(`sentinel_delegation_sig_${address.toLowerCase()}`);
      const savedData = localStorage.getItem(`sentinel_delegation_data_${address.toLowerCase()}`);
      if (savedSig && savedData) {
        setDelegationSignature(savedSig);
        try {
          setDelegationData(JSON.parse(savedData));
        } catch { }
      } else {
        setDelegationSignature(null);
        setDelegationData(null);
      }
    } else {
      setDelegationSignature(null);
      setDelegationData(null);
    }
  }, [address]);

  const runDemo = async () => {
    setLogs([]);
    setDone(false);
    setRunStatus('idle');
    setRunning(true);
    setLastTxUrl(null);
    setLastTxHash(null);
    setLastMeta(null);

    try {
      if (!isConnected || !address) {
        appendLog('> Wallet not connected. Please connect your wallet to run the demo.', 'error');
        await sleep(600);
        appendLog('---', 'muted');
        appendLog('> Session complete.', 'info');
        setRunStatus('error');
        setDone(true);
        return;
      }

      appendLog('> Bootstrapping SentinelPay demo runtime...', 'info');
      await sleep(500);
      appendLog(`> Backend: ${backendBaseUrl}`, 'muted');
      await sleep(450);

      const [healthRes, networkRes, vaultRes] = await Promise.all([
        fetch(`${backendBaseUrl}/health`, { cache: 'no-store' }),
        fetch(`${backendBaseUrl}/network-info`, { cache: 'no-store' }),
        fetch(`${backendBaseUrl}/vault-balance?agent_id=${encodeURIComponent(agentId)}`, { cache: 'no-store' }),
      ]);

      const health = healthRes.ok ? await safeJson<HealthResponse>(healthRes) : null;
      const network = networkRes.ok ? await safeJson<NetworkInfoResponse>(networkRes) : null;
      const vault = vaultRes.ok ? await safeJson<VaultBalanceResponse>(vaultRes) : null;

      if (health) {
        appendLog(
          `> Health: ${health.status ?? 'ok'} | DB=${health.database ?? 'n/a'} | Worker=${health.payment_worker_enabled ? 'on' : 'off'}`,
          'success'
        );
        if (health.wallet_signature_required) {
          if (delegationSignature && delegationData) {
            appendLog('> Wallet signature required: no (delegated)', 'success');
          } else {
            appendLog('> Wallet signature required: yes', 'success');
          }
        } else {
          appendLog('> Wallet signature required: no', 'success');
        }
      } else {
        appendLog('> Health: unavailable (check backend)', 'warning');
      }

      if (network) {
        appendLog(`> Network: ${network.chain ?? 'Celo'} (chainId ${network.chain_id ?? 'n/a'})`, 'info');
      }

      if (vault?.balance_usdc) {
        appendLog(`> Vault balance (agent vault): ${vault.balance_usdc} USDC`, 'success');
      } else {
        appendLog('> Vault balance (agent vault): unavailable', 'warning');
      }
      if (walletUsdcBalance) {
        appendLog(`> Wallet USDC balance: ${walletUsdcBalance} USDC`, 'info');
      } else if (isConnected) {
        appendLog('> Wallet USDC balance: unavailable', 'warning');
      }

      const selectedActions =
        demoMode === 'both' ? ['weather', 'market'] : demoMode === 'weather' ? ['weather'] : ['market'];

      await sleep(900);
      appendLog(`> Demo plan: ${selectedActions.join(' + ')}`, 'info');
      await sleep(900);
      appendLog(`> Wallet: ${address.slice(0, 6)} ... ${address.slice(-4)}`, 'info');
      await sleep(900);
      let walletSignature: string = '';
      let walletTimestamp: string = '';

      if (delegationSignature && delegationData) {
        appendLog('> Detected valid ERC-7715 Delegation. Bypassing interactive signature.', 'success');
        await sleep(500);
      } else {
        appendLog('> Awaiting wallet signature...', 'info');
        walletTimestamp = String(Math.floor(Date.now() / 1000));
        const walletMessage = buildWalletMessage(address, walletTimestamp);
        try {
          walletSignature = await signMessageAsync({ message: walletMessage });
          appendLog('> Wallet signature captured.', 'success');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          appendLog(`> Wallet signature rejected: ${message}`, 'error');
          await sleep(600);
          appendLog('---', 'muted');
          appendLog('> Session complete.', 'info');
          setRunStatus('error');
          setDone(true);
          return;
        }
      }
      let weatherLocation: { lat: number; lon: number } | null = null;
      if (selectedActions.includes('weather') && useDeviceLocation) {
        appendLog('> Requesting device location...', 'info');
        weatherLocation = await requestDeviceLocation();
        if (weatherLocation) {
          appendLog(`> Location captured: ${weatherLocation.lat.toFixed(4)}, ${weatherLocation.lon.toFixed(4)}`, 'success');
        } else {
          appendLog('> Location unavailable. Using default weather city.', 'warning');
        }
        await sleep(800);
      }

      appendLog(`> Dispatching /execute-demo for agent "${displayAgentId}"...`, 'info');
      await sleep(700);

      // Perform real execution
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (delegationSignature && delegationData) {
        headers['X-Delegation-Signature'] = delegationSignature;
        headers['X-Delegation-Data'] = JSON.stringify(delegationData);
        headers['X-Wallet-Address'] = address;
      }

      const res = await fetch('/api/demo-execute', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agent_id: agentId,
          actions: selectedActions,
          weather_lat: weatherLocation?.lat,
          weather_lon: weatherLocation?.lon,
          wallet_address: !delegationSignature ? address : undefined,
          wallet_signature: !delegationSignature ? walletSignature : undefined,
          wallet_timestamp: !delegationSignature ? walletTimestamp : undefined,
        }),
      });

      const data: DemoExecuteResponse = await res.json().catch(() => null);
      const errorMsg = extractErrorMessage(data);

      if (!res.ok || (!data?.tx_hash && data?.mode !== 'actions')) {
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

      if (selectedActions.length > 0 && data?.mode !== 'actions' && data?.tx_hash) {
        appendLog('> Warning: backend returned legacy demo response.', 'warning');
        appendLog('> Restart backend to enable Weather/Market action mode.', 'warning');
        await sleep(900);
      }

      if (data?.mode === 'actions' && Array.isArray(data.actions)) {
        for (const [index, action] of data.actions.entries()) {
          const label = action.name ?? `action-${index + 1}`;
          appendLog(`> Step ${index + 1}: ${label} API`, 'info');
          await sleep(900);
          const result = action.result ?? {};
          const paid = (result as Record<string, unknown>)?.paid ? 'true' : 'false';
          appendLog(`> Result: paid=${paid}`, 'success');
          await sleep(900);

          if (label === 'weather') {
            const city = String((result as Record<string, unknown>)?.city ?? 'n/a');
            const temp = String((result as Record<string, unknown>)?.temperature ?? 'n/a');
            const cond = String((result as Record<string, unknown>)?.condition ?? 'n/a');
            appendLog(`> Data: ${city} | ${temp} | ${cond}`, 'info');
          } else if (label === 'market') {
            const btc = String((result as Record<string, unknown>)?.btc_price ?? 'n/a');
            const eth = String((result as Record<string, unknown>)?.eth_price ?? 'n/a');
            const celo = String((result as Record<string, unknown>)?.celo_price ?? 'n/a');
            const trend = String((result as Record<string, unknown>)?.trend ?? 'n/a');
            appendLog(`> Data: BTC ${btc} | ETH ${eth} | CELO ${celo} | trend ${trend}`, 'info');
          }
          await sleep(900);

          if (action.tx_hash) {
            appendLog(`> Tx confirmed: ${action.tx_hash}`, 'success');
            setLastTxHash(action.tx_hash);
          }
          if (action.tx_url) {
            appendLog(`> Explorer: ${action.tx_url}`, 'muted');
            setLastTxUrl(action.tx_url);
          }
          await sleep(900);
        }

        appendLog('---', 'muted');
        appendLog('> Session complete.', 'info');
        setRunStatus('success');
        setDone(true);
        return;
      }

      const amountValue = typeof data.amount_usdc === 'number' ? data.amount_usdc : Number(data.amount_usdc);
      const amountText = Number.isFinite(amountValue) ? amountValue.toFixed(3) : 'n/a';
      const recipientText = data.recipient ?? 'unknown';
      const chainIdText = data.chain_id ?? network?.chain_id ?? 'n/a';

      appendLog(`> Payment authorized by SentinelVault`, 'success');
      await sleep(600);
      appendLog(`> Agent: ${displayAgentId}`, 'info');
      await sleep(450);
      appendLog(`> Amount: ${amountText} USDC`, 'info');
      await sleep(450);
      appendLog(`> Recipient: ${recipientText}`, 'info');
      await sleep(600);
      appendLog(`> Chain ID: ${chainIdText}`, 'muted');
      await sleep(600);
      appendLog(`> Tx confirmed: ${data.tx_hash}`, 'success');

      setLastTxHash(data.tx_hash ?? null);
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

      const execRes = await fetch(
        `${backendBaseUrl}/executions?agent_id=${encodeURIComponent(agentId)}`,
        { cache: 'no-store' }
      ).catch(() => null);
      if (execRes && execRes.ok) {
        const execPayload = await safeJson<ExecutionsResponse>(execRes);
        const latest = execPayload?.executions?.[0];
        if (latest && latest.tx_hash === data.tx_hash) {
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
    if (level === 'warning') return '#facc15';
    if (level === 'muted') return '#475569';
    return '#60a5fa'; // Blue for standard info logs
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

        {/* Demo mode selector */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {[
            { key: 'weather', label: 'Weather only' },
            { key: 'market', label: 'Market only' },
            { key: 'both', label: 'Both' },
          ].map(option => {
            const active = demoMode === option.key;
            return (
              <button
                key={option.key}
                onClick={() => setDemoMode(option.key as typeof demoMode)}
                className={`text-xs px-4 py-2 rounded-lg border transition ${active
                  ? 'bg-cyan-500/10 border-cyan-400 text-cyan-300'
                  : 'bg-white/[0.02] border-white/[0.08] text-slate-400 hover:text-white'
                  }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 mb-6 text-xs text-slate-400">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useDeviceLocation}
              onChange={e => setUseDeviceLocation(e.target.checked)}
              className="accent-cyan-400"
            />
            Use device location for weather
          </label>
          {!useDeviceLocation && (
            <span className="text-slate-500">Uses default city from backend</span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={runDemo}
            disabled={running || !isConnected}
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
                {!isConnected ? 'Connect Wallet to Run' : done ? 'Run Again' : 'Run Demo'}
              </>
            )}
          </button>

          {done && (
            <div
              className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border ${runStatus === 'error'
                ? 'bg-rose-500/[0.07] border-rose-500/20 text-rose-300'
                : 'bg-emerald-500/[0.07] border-emerald-500/20 text-emerald-400'
                }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${runStatus === 'error' ? 'bg-rose-400' : 'bg-emerald-400'
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
