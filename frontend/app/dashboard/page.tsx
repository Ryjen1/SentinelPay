'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAccount, usePublicClient, useWriteContract, useSignTypedData, useWalletClient } from 'wagmi';
import { formatUnits, isAddress, keccak256, parseUnits, toBytes, stringToHex } from 'viem';
import ConnectButton from '@/components/ConnectButton';
import Navbar from '@/components/Navbar';

// ── Contract addresses (Celo Sepolia by default) ─────────────────────────
const VAULT_ADDRESS = (process.env.NEXT_PUBLIC_AGENT_VAULT || '0x0000000000000000000000000000000000000000') as `0x${string}`;
const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC || '0x0000000000000000000000000000000000000000') as `0x${string}`;
const DEFAULT_AGENT_ID = process.env.NEXT_PUBLIC_AGENT_ID ?? 'weather_agent';
const NETWORK_LABEL = process.env.NEXT_PUBLIC_NETWORK_LABEL ?? 'Celo Sepolia Testnet';
const EXPLORER_BASE_URL = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL ?? 'https://sepolia.celoscan.io';
const TARGET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '11142220');
const TARGET_CHAIN_HEX = `0x${TARGET_CHAIN_ID.toString(16)}`;
const POLICY_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_POLICY_REGISTRY || '0x9314E31a23E4e3A04B1Df727Fc224361270e9Fc5') as `0x${string}`;
const BACKEND_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
const EXECUTION_PAGE_SIZE = 15;

if (!VAULT_ADDRESS || !USDC_ADDRESS) {
  console.warn('[dashboard] Missing NEXT_PUBLIC_AGENT_VAULT or NEXT_PUBLIC_USDC - functionality will be limited.');
}

// ── Minimal ABIs ──────────────────────────────────────────────────────────
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const AGENT_VAULT_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const POLICY_REGISTRY_ABI = [
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'getPolicy',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'bytes32' }],
    outputs: [
      { name: 'maxPerTx', type: 'uint256' },
      { name: 'dailyCap', type: 'uint256' },
      { name: 'whitelist', type: 'address[]' },
      { name: 'isActive', type: 'bool' },
      { name: 'registeredAt', type: 'uint256' },
    ],
  },
  {
    name: 'registerAgent',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'bytes32' },
      { name: 'maxPerTx', type: 'uint256' },
      { name: 'dailyCap', type: 'uint256' },
      { name: 'whitelist', type: 'address[]' },
    ],
    outputs: [],
  },
  {
    name: 'updatePolicy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'bytes32' },
      { name: 'maxPerTx', type: 'uint256' },
      { name: 'dailyCap', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'pauseAgent',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'unpauseAgent',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentId', type: 'bytes32' }],
    outputs: [],
  },
] as const;

interface Transaction {
  id: number;
  agent_id: string;
  recipient: string;
  amount_usdc: number;
  tx_hash: string;
  status: string;
  timestamp: number;
  tx_url?: string;
  block_number?: number;
  gas_used?: number;
  block_reason?: string;
}

type ApiErrorPayload = {
  error?: string;
  detail?: string | { error?: string };
};

type MarketSnapshotResponse = {
  available?: boolean;
  snapshot?: {
    market?: string;
    btc_price?: string;
    eth_price?: string;
    celo_price?: string;
    trend?: string;
    source?: string;
  };
  captured_at?: string;
  age_seconds?: number;
  message?: string;
};

type WeatherSnapshotResponse = {
  available?: boolean;
  snapshot?: {
    city?: string;
    temperature?: string;
    condition?: string;
    humidity?: string;
    source?: string;
  };
  captured_at?: string;
  age_seconds?: number;
  message?: string;
};

export default function Dashboard() {
  const { address } = useAccount();
  const activeAgentId = address ? `${DEFAULT_AGENT_ID}_${address.toLowerCase()}` : DEFAULT_AGENT_ID;
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [visibleTxCount, setVisibleTxCount] = useState(EXECUTION_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [showEditPolicy, setShowEditPolicy] = useState(false);
  const [maxPerTx, setMaxPerTx] = useState('1.00');
  const [dailyCap, setDailyCap] = useState('5.00');
  const [policyTxStatus, setPolicyTxStatus] = useState<'idle' | 'signing' | 'pending' | 'success' | 'error'>('idle');
  const [policyTxError, setPolicyTxError] = useState<string | null>(null);
  const [policyTxHash, setPolicyTxHash] = useState<string | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyLoaded, setPolicyLoaded] = useState(false);
  const [policyRegistered, setPolicyRegistered] = useState(false);
  const [policyOwner, setPolicyOwner] = useState<`0x${string}` | null>(null);
  const [whitelistRecipient, setWhitelistRecipient] = useState('0x61254AEcF84eEdb890f07dD29f7F3cd3b8Eb2CBe');
  const [showFundVault, setShowFundVault] = useState(false);
  const [depositAmount, setDepositAmount] = useState('1.00');
  const [isPaused, setIsPaused] = useState(false);
  const [pauseTxPending, setPauseTxPending] = useState(false);
  const [depositStatus, setDepositStatus] = useState<'idle' | 'approving' | 'depositing' | 'done' | 'error'>('idle');
  const [isExecuting, setIsExecuting] = useState(false);

  // MetaMask Delegation State
  const [showDelegationModal, setShowDelegationModal] = useState(false);
  const [delegationStatus, setDelegationStatus] = useState<'idle' | 'signing' | 'success' | 'error'>('idle');
  const [delegationError, setDelegationError] = useState<string | null>(null);
  const [delegationSignature, setDelegationSignature] = useState<string | null>(null);
  const [delegationData, setDelegationData] = useState<{ domain: any, message: any } | null>(null);
  const { signTypedDataAsync } = useSignTypedData();
  const { data: walletClient } = useWalletClient();
  const [dbStatus, setDbStatus] = useState<{ backend: string; row_count: number } | null>(null);
  const [pollingActive, setPollingActive] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [vaultBalance, setVaultBalance] = useState<string>('—');
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<{ chain: string; chain_id: number; why_celo: string } | null>(null);
  const [agentTask, setAgentTask] = useState('');
  const [agentResult, setAgentResult] = useState<{ steps: string[]; tx_hash?: string | null } | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{ status: string; network: string; database: string; mock_mode: boolean; relayer_address?: string } | null>(null);
  const [weatherSnapshot, setWeatherSnapshot] = useState<WeatherSnapshotResponse | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [marketSnapshot, setMarketSnapshot] = useState<MarketSnapshotResponse | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const isOwner = !!address && !!policyOwner && address.toLowerCase() === policyOwner.toLowerCase();
  const canEditPolicy = !policyOwner || isOwner;
  const visibleTxTotal = Math.min(visibleTxCount, transactions.length);
  const visibleTransactions = transactions.slice(0, visibleTxTotal);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4500);
  };

  const formatAgentId = (id: string) => {
    if (!id) return id;
    const parts = id.split('_');
    if (parts.length < 2) return id;
    const maybeAddress = parts[parts.length - 1];
    if (/^0x[0-9a-fA-F]{6,}$/.test(maybeAddress)) {
      const short = `${maybeAddress.slice(0, 6)} ... ${maybeAddress.slice(-4)}`;
      return `${parts.slice(0, -1).join('_')}_${short}`;
    }
    return id;
  };

  const displayAgentId = formatAgentId(activeAgentId);

  const getApiErrorMessage = (payload: ApiErrorPayload, fallback: string) => {
    const topLevel = typeof payload.error === 'string' ? payload.error.trim() : '';
    const detailString = typeof payload.detail === 'string' ? payload.detail.trim() : '';
    const detailNested =
      payload.detail && typeof payload.detail === 'object' && typeof payload.detail.error === 'string'
        ? payload.detail.error.trim()
        : '';

    if (topLevel && detailString) return `${topLevel}: ${detailString}`;
    if (topLevel && detailNested) return `${topLevel}: ${detailNested}`;
    if (topLevel) return topLevel;
    if (detailString) return detailString;
    if (detailNested) return detailNested;
    return fallback;
  };

  const ensureWalletOnTargetChain = async () => {
    const ethereum = (window as Window & { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!ethereum?.request) {
      throw new Error('No injected wallet provider found');
    }

    const chainHex = String(await ethereum.request({ method: 'eth_chainId' }));
    const currentChainId = Number.parseInt(chainHex, 16);
    if (currentChainId === TARGET_CHAIN_ID) {
      return;
    }

    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: TARGET_CHAIN_HEX }],
      });
    } catch (switchErr: unknown) {
      const code = typeof switchErr === 'object' && switchErr && 'code' in switchErr ? (switchErr as { code?: number }).code : undefined;
      if (code !== 4902) {
        throw switchErr;
      }
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: TARGET_CHAIN_HEX,
          chainName: 'Celo Sepolia',
          nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
          rpcUrls: [process.env.NEXT_PUBLIC_CELO_RPC_URL],
          blockExplorerUrls: [EXPLORER_BASE_URL],
        }],
      });
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: TARGET_CHAIN_HEX }],
      });
    }

    const finalChainHex = String(await ethereum.request({ method: 'eth_chainId' }));
    const finalChainId = Number.parseInt(finalChainHex, 16);
    if (finalChainId !== TARGET_CHAIN_ID) {
      throw new Error(
        `Wallet is still on chain ${finalChainId}. Please switch to ${NETWORK_LABEL} and retry.`
      );
    }
  };

  const handleDeposit = async () => {
    if (!address) {
      showToast('Please connect wallet first', 'info');
      return;
    }

    const amountUnits = parseUnits(depositAmount, 6);
    const agentIdBytes = keccak256(toBytes(activeAgentId));

    try {
      await ensureWalletOnTargetChain();

      setDepositStatus('approving');
      console.log('[SentinelPay] Step 1 – Requesting USDC approval…', {
        token: USDC_ADDRESS,
        spender: VAULT_ADDRESS,
        amount: amountUnits.toString(),
      });

      const approveTxHash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [VAULT_ADDRESS, amountUnits],
        chainId: TARGET_CHAIN_ID,
      });
      console.log('[SentinelPay] USDC approve tx sent:', approveTxHash);

      setDepositStatus('depositing');
      console.log('[SentinelPay] Step 2 – Depositing into SentinelVault…', {
        vault: VAULT_ADDRESS,
        agentId: activeAgentId,
        agentIdBytes,
        amount: amountUnits.toString(),
      });

      const depositTxHash = await writeContractAsync({
        address: VAULT_ADDRESS,
        abi: AGENT_VAULT_ABI,
        functionName: 'deposit',
        args: [agentIdBytes, amountUnits],
        chainId: TARGET_CHAIN_ID,
      });
      console.log('[SentinelPay] Deposit tx sent:', depositTxHash);

      setDepositStatus('done');
      setShowFundVault(false);
      showToast(`Deposited ${depositAmount} USDC`, 'success');
    } catch (err: unknown) {
      setDepositStatus('error');
      const message = err instanceof Error ? err.message : String(err);
      console.error('[SentinelPay] Deposit failed:', err);
      showToast(`Deposit failed: ${message}`, 'error');
    } finally {
      setTimeout(() => setDepositStatus('idle'), 3000);
    }
  };

  const fetchExecutions = (showLoading = true) => {
    if (showLoading) setLoading(true);
    fetch(`${BACKEND_BASE_URL}/executions?agent_id=${encodeURIComponent(activeAgentId)}`)
      .then(r => r.json())
      .then(data => {
        setTransactions(data.executions || []);
        if (showLoading) setLoading(false);
      })
      .catch(() => {
        if (showLoading) setLoading(false);
      });
  };

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      fetchExecutions(false);
    }, 5000);
    setPollingActive(true);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPollingActive(false);
  };

  const fetchDbStatus = () => {
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/debug/db-status`)
      .then(r => r.json())
      .then(data => setDbStatus(data))
      .catch(() => setDbStatus(null));
  };

  const fetchVaultBalance = () => {
    setBalanceLoading(true);
    fetch(`${BACKEND_BASE_URL}/vault-balance?agent_id=${encodeURIComponent(activeAgentId)}`)
      .then(r => r.json())
      .then(data => {
        setVaultBalance(data.balance_usdc ?? '—');
        setBalanceLoading(false);
      })
      .catch(() => {
        setVaultBalance('—');
        setBalanceLoading(false);
      });
  };

  const fetchNetworkInfo = () => {
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/network-info`)
      .then(r => r.json())
      .then(data => setNetworkInfo(data))
      .catch(() => setNetworkInfo(null));
  };

  const fetchHealth = () => {
    fetch(`${BACKEND_BASE_URL}/health`)
      .then(r => r.json())
      .then(data => setHealthStatus(data))
      .catch(() => setHealthStatus(null));
  };

  const fetchMarketSnapshot = () => {
    setMarketLoading(true);
    setMarketError(null);
    fetch(`${BACKEND_BASE_URL}/market-snapshot?agent_id=${encodeURIComponent(activeAgentId)}`)
      .then(r => r.json())
      .then((data: MarketSnapshotResponse) => {
        setMarketSnapshot(data);
        setMarketLoading(false);
      })
      .catch(() => {
        setMarketError('Unable to load market snapshot');
        setMarketLoading(false);
      });
  };

  const fetchWeatherSnapshot = () => {
    setWeatherLoading(true);
    setWeatherError(null);
    fetch(`${BACKEND_BASE_URL}/weather-snapshot?agent_id=${encodeURIComponent(activeAgentId)}`)
      .then(r => r.json())
      .then((data: WeatherSnapshotResponse) => {
        setWeatherSnapshot(data);
        setWeatherLoading(false);
      })
      .catch(() => {
        setWeatherError('Unable to load weather snapshot');
        setWeatherLoading(false);
      });
  };

  const runAgent = async () => {
    if (!agentTask.trim()) return;
    setAgentRunning(true);
    setAgentResult(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      
      let walletSignature: string | undefined;
      let walletTimestamp: string | undefined;

      if (address && delegationSignature && delegationData) {
        headers['X-Delegation-Signature'] = delegationSignature;
        headers['X-Delegation-Data'] = JSON.stringify(delegationData);
        headers['X-Wallet-Address'] = address;
      } else if (address) {
        // Fallback to interactive signature
        walletTimestamp = String(Math.floor(Date.now() / 1000));
        const walletMessage = [
          'SentinelPay Demo Authorization',
          `Address: ${address}`,
          `AgentId: ${activeAgentId}`,
          `Timestamp: ${walletTimestamp}`,
          'Path: /agent-execute',
        ].join('\n');

        walletSignature = await (window as any).ethereum.request({
          method: 'personal_sign',
          params: [walletMessage, address],
        });
      }

      const res = await fetch('/api/agent-execute', {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          task: agentTask, 
          agent_id: activeAgentId,
          wallet_address: address,
          wallet_signature: walletSignature,
          wallet_timestamp: walletTimestamp
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as ApiErrorPayload));
        throw new Error(getApiErrorMessage(err, 'Agent execution failed'));
      }
      const data = await res.json();
      setAgentResult({ steps: data.steps || [], tx_hash: data.tx_hash });
      fetchExecutions();
      startPolling();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setAgentResult({ steps: [`Error: ${message}`], tx_hash: null });
    } finally {
      setAgentRunning(false);
    }
  };

  const runDemoExecution = async () => {
    setIsExecuting(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      
      let walletSignature: string | undefined;
      let walletTimestamp: string | undefined;

      if (address && delegationSignature && delegationData) {
        headers['X-Delegation-Signature'] = delegationSignature;
        headers['X-Delegation-Data'] = JSON.stringify(delegationData);
        headers['X-Wallet-Address'] = address;
      } else if (address) {
        // Fallback to interactive signature
        walletTimestamp = String(Math.floor(Date.now() / 1000));
        const walletMessage = [
          'SentinelPay Demo Authorization',
          `Address: ${address}`,
          `AgentId: ${activeAgentId}`,
          `Timestamp: ${walletTimestamp}`,
          'Path: /execute-demo',
        ].join('\n');

        walletSignature = await (window as any).ethereum.request({
          method: 'personal_sign',
          params: [walletMessage, address],
        });
      }

      const res = await fetch('/api/demo-execute', {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          agent_id: activeAgentId,
          wallet_address: address,
          wallet_signature: walletSignature,
          wallet_timestamp: walletTimestamp
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as ApiErrorPayload));
        throw new Error(getApiErrorMessage(err, 'Demo execution failed'));
      }
      await res.json();
      fetchExecutions();
      startPolling();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Demo execution failed: ${message}`, 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  const loadPolicy = async () => {
    if (!publicClient) return;
    if (!POLICY_REGISTRY_ADDRESS || POLICY_REGISTRY_ADDRESS === '0x0000000000000000000000000000000000000000') return;
    setPolicyLoading(true);
    try {
      const agentIdBytes = keccak256(toBytes(activeAgentId));
      const owner = await publicClient.readContract({
        address: POLICY_REGISTRY_ADDRESS,
        abi: POLICY_REGISTRY_ABI,
        functionName: 'owner',
      }) as `0x${string}`;
      setPolicyOwner(owner);

      const policy = await publicClient.readContract({
        address: POLICY_REGISTRY_ADDRESS,
        abi: POLICY_REGISTRY_ABI,
        functionName: 'getPolicy',
        args: [agentIdBytes],
      }) as readonly [bigint, bigint, `0x${string}`[], boolean, bigint];

      const registeredAt = policy[4];
      const registered = !!registeredAt && registeredAt > BigInt(0);
      setPolicyRegistered(registered);
      if (registered) {
        const maxText = formatUnits(policy[0], 6);
        const dailyText = formatUnits(policy[1], 6);
        setMaxPerTx(Number(maxText).toFixed(2));
        setDailyCap(Number(dailyText).toFixed(2));
        setIsPaused(!policy[3]);
      } else {
        setIsPaused(false);
      }
      setPolicyLoaded(true);
    } catch (err) {
      console.warn('[dashboard] failed to load policy from chain', err);
      setPolicyLoaded(true);
    } finally {
      setPolicyLoading(false);
    }
  };

  const handlePolicyUpdate = async () => {
    if (!address) {
      setPolicyTxStatus('error');
      setPolicyTxError('Please connect your wallet first.');
      return;
    }
    if (!POLICY_REGISTRY_ADDRESS || POLICY_REGISTRY_ADDRESS === '0x0000000000000000000000000000000000000000') {
      setPolicyTxStatus('error');
      setPolicyTxError('Policy registry address not configured.');
      return;
    }
    if (policyOwner && !isOwner) {
      setPolicyTxStatus('error');
      setPolicyTxError(`Only the policy owner can update limits.`);
      return;
    }

    const maxValue = Number(maxPerTx);
    const dailyValue = Number(dailyCap);
    if (!Number.isFinite(maxValue) || maxValue <= 0 || !Number.isFinite(dailyValue) || dailyValue <= 0) {
      setPolicyTxStatus('error');
      setPolicyTxError('Please enter valid policy limits.');
      return;
    }
    if (!policyRegistered && !isAddress(whitelistRecipient)) {
      setPolicyTxStatus('error');
      setPolicyTxError('Enter a valid whitelist recipient address.');
      return;
    }

    setPolicyTxError(null);
    setPolicyTxHash(null);
    setPolicyTxStatus('signing');

    try {
      await ensureWalletOnTargetChain();
      const agentIdBytes = keccak256(toBytes(activeAgentId));
      const updateArgs = [agentIdBytes, parseUnits(maxPerTx, 6), parseUnits(dailyCap, 6)] as const;
      const whitelistArg = [whitelistRecipient as `0x${string}`] as readonly `0x${string}`[];
      const registerArgs = [agentIdBytes, parseUnits(maxPerTx, 6), parseUnits(dailyCap, 6), whitelistArg] as const;

      const txHash = await writeContractAsync({
        address: POLICY_REGISTRY_ADDRESS,
        abi: POLICY_REGISTRY_ABI,
        functionName: policyRegistered ? 'updatePolicy' : 'registerAgent',
        args: policyRegistered ? updateArgs : registerArgs,
        chainId: TARGET_CHAIN_ID,
      });

      setPolicyTxHash(txHash);
      setPolicyTxStatus('pending');

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }

      setPolicyTxStatus('success');
      showToast('Policy updated on-chain', 'success');
      setShowEditPolicy(false);
      await loadPolicy();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setPolicyTxStatus('error');
      setPolicyTxError(message);
      showToast(`Policy update failed: ${message}`, 'error');
    }
  };

  const handleTogglePause = async () => {
    if (!address) {
      showToast('Please connect your wallet first.', 'error');
      return;
    }
    if (!POLICY_REGISTRY_ADDRESS || POLICY_REGISTRY_ADDRESS === '0x0000000000000000000000000000000000000000') {
      showToast('Policy registry address not configured.', 'error');
      return;
    }
    if (policyOwner && !isOwner) {
      showToast('Only the policy owner can pause or resume this agent.', 'error');
      return;
    }

    setPauseTxPending(true);
    try {
      await ensureWalletOnTargetChain();
      const agentIdBytes = keccak256(toBytes(activeAgentId));
      const functionName = (isPaused ? 'unpauseAgent' : 'pauseAgent') as 'pauseAgent' | 'unpauseAgent';
      const txHash = await writeContractAsync({
        address: POLICY_REGISTRY_ADDRESS,
        abi: POLICY_REGISTRY_ABI,
        functionName,
        args: [agentIdBytes],
        chainId: TARGET_CHAIN_ID,
      });

      showToast(isPaused ? 'Resuming agent…' : 'Pausing agent…', 'info');
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }
      showToast(isPaused ? 'Agent resumed on-chain' : 'Agent paused on-chain', 'success');
      await loadPolicy();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Pause/resume failed: ${message}`, 'error');
    } finally {
      setPauseTxPending(false);
    }
  };

  const handleSignDelegation = async () => {
    if (!address) {
      setDelegationError("Please connect wallet first.");
      setDelegationStatus('error');
      return;
    }
    setDelegationError(null);
    setDelegationSignature(null);
    setDelegationStatus('signing');
    try {
      await ensureWalletOnTargetChain();

      if (!walletClient) {
        throw new Error("Wallet client not ready. Please try again.");
      }

      const types = {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        SentinelPermission: [
          { name: 'delegate', type: 'address' },
          { name: 'delegator', type: 'address' },
          { name: 'authority', type: 'bytes32' },
          { name: 'constraints', type: 'Constraint[]' },
          { name: 'salt', type: 'uint256' },
        ],
        Constraint: [
          { name: 'enforcer', type: 'address' },
          { name: 'terms', type: 'bytes' },
        ]
      };

      // Final fix by renaming protected keywords that triggered the "internal delegation" error
      const domain = {
        name: 'SentinelPay Permissions',
        version: '1',
        chainId: TARGET_CHAIN_ID,
        verifyingContract: POLICY_REGISTRY_ADDRESS
      };

      const relayerAddress = healthStatus?.relayer_address || '0xA99F898530dF1514A566f1a6562D62809e99557D';

      const message = {
        delegate: relayerAddress,
        delegator: address,
        authority: '0x0000000000000000000000000000000000000000000000000000000000000000',
        constraints: [
          {
            enforcer: POLICY_REGISTRY_ADDRESS,
            terms: stringToHex('MAX_SPEND:5_USDC_DAILY')
          }
        ],
        salt: Number(Math.floor(Date.now() / 1000))
      };

      const data = JSON.stringify({
        types,
        domain,
        primaryType: 'SentinelPermission',
        message
      });

      const signature = await (window as any).ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [address, data],
      });

      const dData = { domain, message };
      setDelegationSignature(signature);
      setDelegationData(dData);

      // Persist to localStorage for "session-less" feel across refreshes
      if (typeof window !== 'undefined') {
        localStorage.setItem(`sentinel_delegation_sig_${address.toLowerCase()}`, signature);
        localStorage.setItem(`sentinel_delegation_data_${address.toLowerCase()}`, JSON.stringify(dData));
      }

      setDelegationStatus('success');
      setDelegationStatus('success');
      showToast('MetaMask Delegation secured!', 'success');
    } catch (err: any) {
      console.error("Delegation Error:", err);
      // Better error parsing for [object Object] cases
      const message = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      setDelegationError(message);
      setDelegationStatus('error');
    }
  };

  useEffect(() => {
    if (address && typeof window !== 'undefined') {
      const savedSig = localStorage.getItem(`sentinel_delegation_sig_${address.toLowerCase()}`);
      const savedData = localStorage.getItem(`sentinel_delegation_data_${address.toLowerCase()}`);
      if (savedSig && savedData) {
        setDelegationSignature(savedSig);
        try {
          setDelegationData(JSON.parse(savedData));
          setDelegationStatus('success');
        } catch (e) {
          console.error("Failed to parse saved delegation data", e);
        }
      } else {
        setDelegationSignature(null);
        setDelegationData(null);
        setDelegationStatus('idle');
      }
    }
  }, [address]);

  useEffect(() => {
    fetchExecutions();
    fetchDbStatus();
    fetchVaultBalance();
    fetchNetworkInfo();
    fetchHealth();
    fetchWeatherSnapshot();
    fetchMarketSnapshot();
    loadPolicy();
    const balanceInterval = setInterval(fetchVaultBalance, 10000);
    const weatherInterval = setInterval(fetchWeatherSnapshot, 15000);
    const marketInterval = setInterval(fetchMarketSnapshot, 15000);
    return () => {
      clearInterval(balanceInterval);
      clearInterval(weatherInterval);
      clearInterval(marketInterval);
      stopPolling();
    };
  }, [publicClient, activeAgentId]);

  const S = {
    bg: 'var(--primary-bg)',
    surface: 'var(--surface)',
    surfaceHover: 'var(--surface-hover)',
    border: 'var(--border-subtle)',
    borderAccent: 'var(--border-accent)',
    borderGlow: 'var(--border-glow)',
    accent: 'var(--primary-accent)',
    accentLight: 'var(--highlight-glow)',
    muted: 'var(--text-muted)',
    dim: 'var(--text-dim)',
    success: 'var(--success)',
    error: 'var(--error)',
    textPrimary: 'var(--text-primary)',
  };

  const inputCls = "w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none transition-colors";
  const inputStyle = { backgroundColor: S.surface, border: `1px solid ${S.border}`, fontFamily: 'inherit' };

  return (
    <main className="min-h-screen text-white" style={{ backgroundColor: S.bg }}>
      <div className="fixed inset-0 bg-cross-grid z-0 pointer-events-none opacity-60" />

      {/* ── Nav ── */}
      <Navbar variant="fixed" />

      {toast && (
        <div
          className="fixed top-24 right-6 z-[60] rounded-xl px-4 py-3 text-xs font-semibold border backdrop-blur"
          style={{
            backgroundColor: toast.type === 'error' ? 'rgba(248,113,113,0.12)' : toast.type === 'success' ? 'rgba(16,217,129,0.12)' : 'rgba(148,163,184,0.12)',
            borderColor: toast.type === 'error' ? 'rgba(248,113,113,0.3)' : toast.type === 'success' ? 'rgba(16,217,129,0.35)' : 'rgba(148,163,184,0.3)',
            color: toast.type === 'error' ? '#f87171' : toast.type === 'success' ? '#4ade80' : '#cbd5f5',
            boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
          }}
        >
          {toast.message}
        </div>
      )}

      {/* ── Page content ── */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-24 pb-10">

        {/* Page header */}
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-10 gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border mb-3" style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.03)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: S.accentLight }}></span>
              <span className="text-[10px] font-mono uppercase tracking-widest font-semibold" style={{ color: S.textPrimary }}>
                Policy Operations Module
              </span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2 text-gradient">Agent Control Center</h1>
            <p className="text-sm font-medium" style={{ color: S.muted }}>
              Manage AI autonomies with sub-second finality and deterministic on-chain policy enforcement.
            </p>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium transition-colors px-4 py-2 rounded-lg btn-secondary"
            style={{ color: S.textPrimary, backgroundColor: 'rgba(255,255,255,0.05)', border: `1px solid ${S.border}` }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            Exit Terminal
          </Link>
        </div>

        {/* ── Bento row 1: Status + Policy + Contracts ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

          {/* Agent status */}
          <div
            className="rounded-2xl p-6 relative overflow-hidden group card-interactive backdrop-blur-md"
            style={{ backgroundColor: 'rgba(18, 18, 22, 0.7)', border: `1px solid ${isPaused ? 'rgba(239,68,68,0.4)' : S.borderAccent}` }}
          >
            {/* Subtle background glow effect */}
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-20 blur-3xl pointer-events-none transition-opacity group-hover:opacity-40"
              style={{ backgroundColor: S.accent }}></div>

            <div className="flex items-center justify-between mb-4 relative z-10">
              <span className="text-xs font-mono uppercase tracking-widest font-medium" style={{ color: S.muted }}>Agent Identity</span>
              <div
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border"
                style={{
                  backgroundColor: isPaused ? 'rgba(239,68,68,0.1)' : 'rgba(16,217,129,0.1)',
                  borderColor: isPaused ? 'rgba(239,68,68,0.3)' : 'rgba(16,217,129,0.3)',
                  color: isPaused ? S.error : S.success,
                }}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${!isPaused && 'animate-pulse'}`} style={{ backgroundColor: isPaused ? S.error : S.success }} />
                {isPaused ? 'Paused' : 'Active'}
              </div>
            </div>

            <Link href={`https://agentscan.xyz/agent/${activeAgentId}`} target="_blank" className="block mt-2 mb-5 group/link relative z-10">
              <div className="font-mono font-bold text-lg mb-1" style={{ color: S.textPrimary }}>{displayAgentId}</div>
              <div className="text-xs font-medium flex items-center gap-1 transition-colors group-hover/link:underline" style={{ color: S.accentLight }}>
                View on AgentScan (optional)
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l9.2-9.2M17 17V7H7" /></svg>
              </div>
            </Link>

            <button
              onClick={handleTogglePause}
              disabled={pauseTxPending || !isOwner || !policyRegistered}
              className="w-full text-sm px-4 py-2.5 rounded-xl transition-all duration-300 font-semibold relative z-10 btn-secondary flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                backgroundColor: isPaused ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)',
                border: isPaused ? '1px solid rgba(239,68,68,0.4)' : `1px solid ${S.border}`,
                color: isPaused ? S.error : S.textPrimary,
              }}
              onMouseEnter={e => { if (!isPaused) { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; e.currentTarget.style.color = S.error; e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)'; } }}
              onMouseLeave={e => { if (!isPaused) { e.currentTarget.style.borderColor = S.border; e.currentTarget.style.color = S.textPrimary; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; } }}
            >
              {pauseTxPending ? (
                <>Updating…</>
              ) : !isOwner ? (
                <>Owner Required</>
              ) : isPaused ? (
                <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Resume Vault</>
              ) : (
                <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> Halt Vault</>
              )}
            </button>
          </div>

          {/* Policy */}
          <div className="rounded-2xl p-6 card-interactive backdrop-blur-md relative overflow-hidden group" style={{ backgroundColor: 'rgba(18, 18, 22, 0.7)', border: `1px solid ${S.border}` }}>
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs font-mono uppercase tracking-widest font-medium" style={{ color: S.muted }}>Smart Policy</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setDelegationStatus('idle');
                    setDelegationError(null);
                    setDelegationSignature(null);
                    setShowDelegationModal(true);
                  }}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors border shadow-[0_0_12px_rgba(246,133,27,0.2)]"
                  style={{ color: '#F6851B', borderColor: 'rgba(246,133,27,0.4)', backgroundColor: 'rgba(246,133,27,0.1)' }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(246,133,27,0.2)'; e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(246,133,27,0.1)'; e.currentTarget.style.color = '#F6851B' }}
                >
                  ERC-7715 Delegate
                </button>
                <button
                  onClick={() => {
                    setPolicyTxStatus('idle');
                    setPolicyTxError(null);
                    setPolicyTxHash(null);
                    setShowEditPolicy(true);
                  }}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border"
                  style={{ color: S.accentLight, borderColor: S.borderGlow, backgroundColor: 'rgba(147,51,234,0.1)' }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.2)'; e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.1)'; e.currentTarget.style.color = S.accentLight }}
                >
                  Configure
                </button>
              </div>
            </div>
            <div className="space-y-3 relative z-10">
              <div className="flex justify-between items-center p-2.5 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                <span className="text-sm font-medium" style={{ color: S.muted }}>Tx Limit</span>
                <span className="text-base font-bold font-mono" style={{ color: S.textPrimary }}>
                  ${policyLoading && !policyLoaded ? '…' : maxPerTx} USDC
                </span>
              </div>
              <div className="flex justify-between items-center p-2.5 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                <span className="text-sm font-medium" style={{ color: S.muted }}>Daily Cap</span>
                <span className="text-base font-bold font-mono" style={{ color: S.textPrimary }}>
                  ${policyLoading && !policyLoaded ? '…' : dailyCap} USDC
                </span>
              </div>
              <div className="flex justify-between items-center p-2.5 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                <span className="text-sm font-medium" style={{ color: S.muted }}>Whitelist</span>
                <span className="text-sm font-bold font-mono" style={{ color: S.accentLight }}>Strict</span>
              </div>
            </div>
          </div>

          {/* Contracts */}
          <div className="rounded-2xl p-6 card-interactive backdrop-blur-md group" style={{ backgroundColor: 'rgba(18, 18, 22, 0.7)', border: `1px solid ${S.border}` }}>
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs font-mono uppercase tracking-widest font-medium" style={{ color: S.muted }}>Contracts</span>
              <a
                href={`${EXPLORER_BASE_URL}/address/${VAULT_ADDRESS}#code`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium flex items-center gap-1 transition-colors"
                style={{ color: S.muted }}
                onMouseEnter={e => (e.currentTarget.style.color = S.textPrimary)}
                onMouseLeave={e => (e.currentTarget.style.color = S.muted)}
              >
                Explorer <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17l9.2-9.2M17 17V7H7" /></svg>
              </a>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: S.muted }}>SentinelVault <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded border border-green-500/30 text-green-400 bg-green-500/10">Verified</span></div>
                <div className="text-sm font-mono truncate" style={{ color: S.accentLight }}>
                  {process.env.NEXT_PUBLIC_AGENT_VAULT?.slice(0, 16)}…{process.env.NEXT_PUBLIC_AGENT_VAULT?.slice(-4)}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: S.muted }}>Settlement Token</div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white leading-none">¢</div>
                  <div className="text-sm font-mono font-bold" style={{ color: S.textPrimary }}>Native USDC</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Bento row 2: Health + Network ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">

          {/* Health */}
          <div className="rounded-2xl p-6 card-interactive backdrop-blur-md" style={{ backgroundColor: 'rgba(18, 18, 22, 0.7)', border: `1px solid ${S.border}` }}>
            <span className="text-xs font-mono uppercase tracking-widest font-medium" style={{ color: S.muted }}>System Status</span>
            <div className="grid grid-cols-3 gap-4 mt-5">
              {[
                { label: 'Relay Engine', ok: healthStatus?.status === 'ok' },
                { label: 'Execution DB', ok: !!healthStatus?.database },
                { label: 'Celo RPC', ok: !!healthStatus?.network },
              ].map(({ label, ok }) => (
                <div
                  key={label}
                  className="rounded-xl p-4 text-center transition-all duration-300"
                  style={{
                    backgroundColor: ok ? 'rgba(16,217,129,0.05)' : 'rgba(239,68,68,0.05)',
                    border: `1px solid ${ok ? 'rgba(16,217,129,0.2)' : 'rgba(239,68,68,0.2)'}`
                  }}
                >
                  <div className="flex justify-center mb-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${ok && 'shadow-[0_0_10px_rgba(16,217,129,0.5)]'}`} style={{ backgroundColor: ok ? S.success : S.error }} />
                  </div>
                  <div className="text-xs font-medium" style={{ color: S.textPrimary }}>{label}</div>
                  <div className="text-[10px] font-mono mt-1" style={{ color: ok ? S.success : S.error }}>
                    {ok ? 'Online' : 'Offline'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Network info */}
          <div className="rounded-2xl p-6 card-interactive backdrop-blur-md relative overflow-hidden" style={{ backgroundColor: 'rgba(18, 18, 22, 0.7)', border: `1px solid ${S.border}` }}>
            {/* Subtle background pattern */}
            <div className="absolute -right-16 -bottom-16 w-48 h-48 opacity-5 pointer-events-none" style={{ background: `radial-gradient(circle, ${S.textPrimary} 10%, transparent 10.5%)`, backgroundSize: '10px 10px' }}></div>

            <span className="text-xs font-mono uppercase tracking-widest font-medium relative z-10" style={{ color: S.muted }}>Network Telemetry</span>
            {networkInfo ? (
              <div className="mt-5 space-y-3 relative z-10">
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm font-medium" style={{ color: S.muted }}>Chain</span>
                  <span className="text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-200 to-yellow-400">{networkInfo.chain}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm font-medium" style={{ color: S.muted }}>Chain ID</span>
                  <span className="text-sm font-mono font-medium px-2 py-0.5 rounded bg-white/5 border border-white/10" style={{ color: S.textPrimary }}>{networkInfo.chain_id}</span>
                </div>
                <div className="mt-4 p-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
                  <p className="text-xs leading-relaxed italic" style={{ color: S.accentLight }}>&quot;{networkInfo.why_celo}&quot;</p>
                </div>
              </div>
            ) : (
              <div className="mt-8 flex justify-center items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: S.accent }}></div>
              </div>
            )}
          </div>
        </div>

        {/* ── Data snapshots: Weather + Market ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Weather snapshot */}
          <div className="rounded-2xl p-6 card-interactive backdrop-blur-md relative overflow-hidden" style={{ backgroundColor: 'rgba(18, 18, 22, 0.7)', border: `1px solid ${S.border}` }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-widest font-medium" style={{ color: S.muted }}>Weather Snapshot</span>
              <button
                onClick={fetchWeatherSnapshot}
                className="text-[10px] uppercase tracking-widest px-2.5 py-1 rounded border"
                style={{ color: S.accentLight, borderColor: S.borderGlow, backgroundColor: 'rgba(147,51,234,0.08)' }}
              >
                Refresh
              </button>
            </div>
            {weatherLoading ? (
              <div className="mt-6 flex justify-center items-center">
                <div className="animate-spin rounded-full h-7 w-7 border-b-2" style={{ borderColor: S.accent }}></div>
              </div>
            ) : weatherSnapshot?.available && weatherSnapshot.snapshot ? (
              <div className="mt-5 space-y-2">
                <div className="flex justify-between text-sm">
                  <span style={{ color: S.muted }}>City</span>
                  <span style={{ color: S.textPrimary }}>{weatherSnapshot.snapshot.city ?? '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: S.muted }}>Temp</span>
                  <span style={{ color: S.textPrimary }}>{weatherSnapshot.snapshot.temperature ?? '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: S.muted }}>Condition</span>
                  <span style={{ color: S.textPrimary }}>{weatherSnapshot.snapshot.condition ?? '—'}</span>
                </div>
                <div className="flex justify-between text-xs pt-2">
                  <span style={{ color: S.muted }}>Humidity</span>
                  <span style={{ color: S.accentLight }}>{weatherSnapshot.snapshot.humidity ?? '—'}</span>
                </div>
                <div className="flex justify-between text-[10px] pt-1" style={{ color: S.dim }}>
                  <span>Source</span>
                  <span>{weatherSnapshot.snapshot.source ?? 'unknown'}</span>
                </div>
                {weatherSnapshot.age_seconds !== undefined && (
                  <div className="text-[10px] pt-1" style={{ color: S.dim }}>
                    Updated {weatherSnapshot.age_seconds}s ago
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-6 text-xs" style={{ color: S.muted }}>
                {weatherError || weatherSnapshot?.message || 'Run the demo to capture the first weather snapshot.'}
              </div>
            )}
          </div>

          {/* Market snapshot */}
          <div className="rounded-2xl p-6 card-interactive backdrop-blur-md relative overflow-hidden" style={{ backgroundColor: 'rgba(18, 18, 22, 0.7)', border: `1px solid ${S.border}` }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-widest font-medium" style={{ color: S.muted }}>Market Snapshot</span>
              <button
                onClick={fetchMarketSnapshot}
                className="text-[10px] uppercase tracking-widest px-2.5 py-1 rounded border"
                style={{ color: S.accentLight, borderColor: S.borderGlow, backgroundColor: 'rgba(147,51,234,0.08)' }}
              >
                Refresh
              </button>
            </div>
            {marketLoading ? (
              <div className="mt-6 flex justify-center items-center">
                <div className="animate-spin rounded-full h-7 w-7 border-b-2" style={{ borderColor: S.accent }}></div>
              </div>
            ) : marketSnapshot?.available && marketSnapshot.snapshot ? (
              <div className="mt-5 space-y-2">
                <div className="flex justify-between text-sm">
                  <span style={{ color: S.muted }}>BTC</span>
                  <span style={{ color: S.textPrimary }}>${marketSnapshot.snapshot.btc_price ?? '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: S.muted }}>ETH</span>
                  <span style={{ color: S.textPrimary }}>${marketSnapshot.snapshot.eth_price ?? '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: S.muted }}>CELO</span>
                  <span style={{ color: S.textPrimary }}>${marketSnapshot.snapshot.celo_price ?? '—'}</span>
                </div>
                <div className="flex justify-between text-xs pt-2">
                  <span style={{ color: S.muted }}>Trend</span>
                  <span style={{ color: S.accentLight }}>{marketSnapshot.snapshot.trend ?? '—'}</span>
                </div>
                <div className="flex justify-between text-[10px] pt-1" style={{ color: S.dim }}>
                  <span>Source</span>
                  <span>{marketSnapshot.snapshot.source ?? 'unknown'}</span>
                </div>
                {marketSnapshot.age_seconds !== undefined && (
                  <div className="text-[10px] pt-1" style={{ color: S.dim }}>
                    Updated {marketSnapshot.age_seconds}s ago
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-6 text-xs" style={{ color: S.muted }}>
                {marketError || marketSnapshot?.message || 'Run the demo to capture the first market snapshot.'}
              </div>
            )}
          </div>
        </div>

        {/* ── Execution Feed ── */}
        <div
          className="rounded-2xl mb-4 card-interactive backdrop-blur-md overflow-hidden relative"
          style={{ backgroundColor: 'rgba(18, 18, 22, 0.7)', border: `1px solid ${S.border}` }}
        >
          {/* Top glow line */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>

          <div
            className="flex items-center justify-between px-6 py-5 bg-white/5"
            style={{ borderBottom: `1px solid ${S.border}` }}
          >
            <div className="flex items-center gap-3">
              <span className="font-bold text-base tracking-wide text-white">Execution Feed</span>
              {pollingActive && (
                <span
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border shadow-[0_0_10px_rgba(16,217,129,0.2)]"
                  style={{ backgroundColor: 'rgba(16,217,129,0.1)', borderColor: 'rgba(16,217,129,0.3)', color: S.success }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Polling
                </span>
              )}
              {dbStatus && (
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/5 border border-white/5" style={{ color: S.muted }}>
                  Showing {visibleTxTotal} / {dbStatus.row_count} records
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={runDemoExecution}
                disabled={isExecuting}
                className="text-xs font-semibold px-4 py-2 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 border"
                style={{ backgroundColor: 'rgba(147,51,234,0.1)', borderColor: S.borderGlow, color: S.accentLight }}
                onMouseEnter={e => { if (!isExecuting) e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(147,51,234,0.1)'; }}
              >
                {isExecuting ? (
                  <><div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: S.accentLight, borderTopColor: 'transparent' }}></div> Processing…</>
                ) : (
                  <><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Simulate Tx</>
                )}
              </button>
              <button
                onClick={() => { fetchExecutions(); fetchDbStatus(); }}
                className="text-xs font-medium transition-colors px-3 py-2 rounded-lg btn-secondary flex items-center gap-1.5"
                style={{ color: S.textPrimary, backgroundColor: 'rgba(255,255,255,0.05)', border: `1px solid ${S.border}` }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.5l5.65-5.65" /></svg>
                Sync
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-6">
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map(row => (
                  <div key={row} className="grid grid-cols-6 gap-4">
                    {Array(6).fill(null).map((_, i) => (
                      <div key={i} className="h-4 rounded-md" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(147,51,234,0.1)', border: `1px solid ${S.borderGlow}` }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={S.accent} strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
              <div className="text-base font-bold mb-1" style={{ color: S.textPrimary }}>Awaiting Executions</div>
              <div className="text-sm" style={{ color: S.muted }}>Run the simulator or trigger the API to see live policy checks.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderBottom: `1px solid ${S.border}` }}>
                    {['Timestamp', 'Agent ID', 'Amount', 'Recipient', 'Tx Hash', 'Status'].map(h => (
                      <th key={h} className="text-left px-6 py-4 text-xs font-mono uppercase tracking-widest font-semibold" style={{ color: S.muted }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {visibleTransactions.map((tx, idx) => (
                    <tr
                      key={tx.id}
                      className="transition-colors hover:bg-white/5"
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <td className="px-6 py-4 text-xs font-mono" style={{ color: S.muted }}>
                        {new Date(tx.timestamp * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className="text-xs font-mono font-medium px-2 py-1 rounded-md bg-white/5 border border-white/10"
                          style={{ color: S.textPrimary }}
                          title={tx.agent_id}
                        >
                          {formatAgentId(tx.agent_id)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold font-mono text-white">
                        <span className="text-emerald-400 mr-1">$</span>{tx.amount_usdc}
                      </td>
                      <td className="px-6 py-4 text-xs font-mono" style={{ color: S.muted }}>
                        {tx.status === 'failed' ? (
                          <span className="opacity-50">N/A</span>
                        ) : (
                          `${tx.recipient?.slice(0, 6)}…${tx.recipient?.slice(-4)}`
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs font-mono">
                        {tx.status === 'failed' && !tx.tx_hash?.startsWith('0x') ? (
                          <span className="text-dim/40 italic">Internal Log</span>
                        ) : (
                          <a
                            href={tx.tx_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 transition-colors group/hash"
                            style={{ color: tx.status === 'failed' ? S.error : S.accentLight }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                            onMouseLeave={e => (e.currentTarget.style.color = tx.status === 'failed' ? S.error : S.accentLight)}
                          >
                            {tx.tx_hash?.slice(0, 10)}…
                            <svg className="opacity-0 group-hover/hash:opacity-100 transition-opacity" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17l9.2-9.2M17 17V7H7" /></svg>
                          </a>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {tx.status === 'failed' ? (
                          <div className="flex flex-col gap-1">
                            <span
                              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border shadow-[0_0_8px_rgba(239,68,68,0.15)]"
                              style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', color: S.error }}
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                              Failed
                            </span>
                            {tx.block_reason && (
                              <span className="text-[10px] font-medium leading-tight truncate max-w-[120px]" style={{ color: S.error }} title={tx.block_reason}>
                                {tx.block_reason}
                              </span>
                            )}
                          </div>
                        ) : tx.block_number ? (
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border shadow-[0_0_8px_rgba(16,217,129,0.15)]"
                            style={{ backgroundColor: 'rgba(16,217,129,0.1)', borderColor: 'rgba(16,217,129,0.3)', color: S.success }}
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Settled
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border"
                            style={{ backgroundColor: 'rgba(234,179,8,0.1)', borderColor: 'rgba(234,179,8,0.3)', color: '#FCD34D' }}
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"></div>
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {transactions.length > EXECUTION_PAGE_SIZE && (
            <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between">
              <span className="text-xs" style={{ color: S.muted }}>
                {visibleTxTotal} shown
              </span>
              <div className="flex items-center gap-2">
                {visibleTxTotal < transactions.length && (
                  <button
                    onClick={() => setVisibleTxCount(count => Math.min(count + EXECUTION_PAGE_SIZE, transactions.length))}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition"
                    style={{ backgroundColor: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.35)', color: '#60a5fa' }}
                  >
                    ▼ Show 15 more
                  </button>
                )}
                {visibleTxTotal > EXECUTION_PAGE_SIZE && (
                  <button
                    onClick={() => setVisibleTxCount(EXECUTION_PAGE_SIZE)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition"
                    style={{ backgroundColor: 'rgba(148,163,184,0.08)', borderColor: 'rgba(148,163,184,0.3)', color: '#cbd5f5' }}
                  >
                    ▲ Show less
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── AI Agent runner ── */}
        <div className="rounded-2xl p-6 relative overflow-hidden backdrop-blur-md" style={{ backgroundColor: 'rgba(18, 18, 22, 0.7)', border: `1px solid ${S.borderAccent}` }}>
          {/* Subtle grid background for the "Terminal" feel */}
          <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none"></div>

          <div className="relative z-10 flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-[0_0_15px_rgba(147,51,234,0.3)]" style={{ backgroundColor: 'rgba(147,51,234,0.1)', borderColor: S.borderGlow }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={S.accentLight} strokeWidth="2"><path d="M12 2a2 2 0 0 1 2 2c0 1.1-.9 2-2 2a2 2 0 0 1-2-2c0-1.1.9-2 2-2zm0 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-6 4H2zm20 0h-4zM6 16v4zm12 0v4H6z" /></svg>
              </div>
              <div>
                <div className="font-bold text-base mb-0.5 text-white tracking-wide">Autonomous Operations Terminal</div>
                <div className="text-xs font-medium" style={{ color: S.muted }}>Connected: <span style={{ color: S.accentLight }}>OpenAI model (configurable)</span> · Policy Guardrails Active</div>
              </div>
            </div>
          </div>

          <div className="relative z-10 flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-purple-400 font-mono font-bold">
                {'>'}
              </div>
              <input
                value={agentTask}
                onChange={e => setAgentTask(e.target.value)}
                placeholder="Instruct the agent (e.g., Pay supplier $5.00 for restocking inventory)"
                className="w-full rounded-xl pl-9 pr-4 py-3.5 text-sm outline-none transition-all shadow-inner"
                style={{ backgroundColor: 'rgba(0,0,0,0.3)', border: `1px solid ${S.border}`, color: '#fff' }}
                onFocus={e => (e.currentTarget.style.borderColor = S.accent)}
                onBlur={e => (e.currentTarget.style.borderColor = S.border)}
              />
            </div>
            <button
              onClick={runAgent}
              disabled={agentRunning || !agentTask.trim()}
              className="shrink-0 px-8 py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_4px_14px_0_rgba(147,51,234,0.39)] hover:shadow-[0_6px_20px_rgba(147,51,234,0.23)] hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(90deg, #9333ea, #7e22ce)' }}
            >
              {agentRunning ? '⚡ Executing…' : 'Deploy Action'}
            </button>
          </div>

          {agentResult?.tx_hash && (
            <div className="relative z-10 mb-4 p-3 rounded-lg flex items-center gap-2 text-xs font-mono border" style={{ backgroundColor: 'rgba(16,217,129,0.05)', borderColor: 'rgba(16,217,129,0.2)', color: S.success }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              Transaction broadcasted: {agentResult.tx_hash}
            </div>
          )}

          {agentResult && (
            <div className="relative z-10 rounded-xl p-5 overflow-hidden" style={{ backgroundColor: '#050508', border: `1px solid ${S.border}` }}>
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-transparent opacity-30"></div>
              <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: S.dim }}>Execution Trace Log</div>
              <ul className="space-y-2">
                {agentResult.steps.map((step, idx) => (
                  <li key={idx} className="text-xs font-mono" style={{ color: '#a1a1aa' }}>
                    <span className="mr-2" style={{ color: '#4c1d95' }}>[{String(idx + 1).padStart(2, '0')}]</span> {step}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Bottom action bar */}
        <div className="flex justify-end mt-4">
          <button
            onClick={() => setShowFundVault(true)}
            className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg transition-colors"
            style={{ backgroundColor: 'rgba(124,58,237,0.1)', border: `1px solid ${S.borderAccent}`, color: S.accentLight }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(124,58,237,0.18)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(124,58,237,0.1)')}
          >
            + Fund Vault
          </button>
        </div>
      </div>

      {/* ── Edit Policy Modal ── */}
      {showEditPolicy && (
        <div className="fixed inset-0 flex items-center justify-center z-50 px-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
          <div className="rounded-2xl p-8 w-full max-w-md relative overflow-hidden" style={{ backgroundColor: '#0a0a12', border: `1px solid ${S.borderAccent}`, boxShadow: `0 0 40px -10px ${S.borderAccent}` }}>
            <div className="absolute top-0 inset-x-0 h-1" style={{ background: `linear-gradient(90deg, transparent, ${S.accent}, transparent)` }}></div>

            <h2 className="text-xl font-bold mb-1 text-white flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={S.accentLight} strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              Smart Policy Config
            </h2>
            <p className="text-sm mb-6" style={{ color: S.muted }}>On-chain parameters require policy owner signature.</p>

            <div className="space-y-5 mb-6">
              {[
                { label: 'Max Per Transaction (USDC)', value: maxPerTx, set: setMaxPerTx, type: 'number' },
                { label: 'Daily Spending Cap (USDC)', value: dailyCap, set: setDailyCap, type: 'number' },
              ].map(({ label, value, set, type }) => (
                <div key={label}>
                  <label className="text-xs font-semibold mb-2 block uppercase tracking-wider" style={{ color: S.textPrimary }}>{label}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                    <input
                      type={type}
                      value={value}
                      onChange={e => set(e.target.value)}
                      disabled={policyTxStatus === 'signing' || policyTxStatus === 'pending'}
                      className="w-full rounded-xl pl-8 pr-4 py-3 text-sm outline-none transition-all shadow-inner font-mono font-bold"
                      style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: `1px solid ${S.border}`, color: '#fff' }}
                      onFocus={e => (e.currentTarget.style.borderColor = S.accent)}
                      onBlur={e => (e.currentTarget.style.borderColor = S.border)}
                    />
                  </div>
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold mb-2 block uppercase tracking-wider" style={{ color: S.textPrimary }}>Whitelisted Recipient</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 border border-white/20"></div>
                  </div>
                  <input
                    type="text"
                    value={whitelistRecipient}
                    onChange={e => setWhitelistRecipient(e.target.value.trim())}
                    className="w-full rounded-xl pl-10 pr-4 py-3 font-mono outline-none transition-all text-xs shadow-inner"
                    style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: `1px solid ${S.border}`, color: S.muted }}
                    onFocus={e => (e.currentTarget.style.borderColor = S.accent)}
                    onBlur={e => (e.currentTarget.style.borderColor = S.border)}
                  />
                </div>
              </div>
            </div>

            <div className="text-xs p-4 rounded-xl mb-6 flex gap-3 items-start" style={{ backgroundColor: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.2)', color: '#FCD34D' }}>
              <svg className="shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              <p className="leading-relaxed">This update modifies the PolicyRegistry parameters. You will be prompted to sign a transaction.</p>
            </div>

            {policyTxStatus !== 'idle' && (
              <div
                className="text-xs p-3 rounded-xl mb-4 border"
                style={{
                  backgroundColor: policyTxStatus === 'error' ? 'rgba(248,113,113,0.08)' : 'rgba(59,130,246,0.08)',
                  borderColor: policyTxStatus === 'error' ? 'rgba(248,113,113,0.3)' : 'rgba(59,130,246,0.3)',
                  color: policyTxStatus === 'error' ? '#fca5a5' : '#93c5fd',
                }}
              >
                {policyTxStatus === 'signing' && 'Awaiting wallet signature…'}
                {policyTxStatus === 'pending' && 'Transaction submitted. Waiting for confirmation…'}
                {policyTxStatus === 'success' && 'Policy updated on-chain.'}
                {policyTxStatus === 'error' && `Policy update failed: ${policyTxError ?? 'Unknown error'}`}
                {policyTxHash && (
                  <div className="mt-2 font-mono text-[10px]" style={{ color: '#c7d2fe' }}>
                    Tx: {policyTxHash.slice(0, 20)}…
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowEditPolicy(false)} className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition-all hover:bg-white/5" style={{ border: `1px solid ${S.border}`, color: S.muted }}>
                Cancel
              </button>
              <button
                onClick={handlePolicyUpdate}
                disabled={policyTxStatus === 'signing' || policyTxStatus === 'pending' || !canEditPolicy}
                className="flex-[1.5] px-4 py-3 rounded-xl text-sm font-bold text-white transition-all hover:-translate-y-0.5 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                style={{ background: 'linear-gradient(90deg, #9333ea, #7e22ce)', boxShadow: '0 4px 15px rgba(147,51,234,0.4)' }}
              >
                {policyTxStatus === 'signing' && 'Awaiting Signature…'}
                {policyTxStatus === 'pending' && 'Confirming…'}
                {policyTxStatus === 'success' && 'Updated'}
                {(policyTxStatus === 'idle' || policyTxStatus === 'error') && (canEditPolicy ? 'Sign & Update' : 'Owner Required')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fund Vault Modal ── */}
      {showFundVault && (
        <div className="fixed inset-0 flex items-center justify-center z-50 px-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
          <div className="rounded-2xl p-8 w-full max-w-md relative overflow-hidden" style={{ backgroundColor: '#0a0a12', border: `1px solid ${S.borderAccent}`, boxShadow: `0 0 40px -10px ${S.borderAccent}` }}>
            <div className="absolute top-0 inset-x-0 h-1" style={{ background: `linear-gradient(90deg, transparent, ${S.success}, transparent)` }}></div>

            <h2 className="text-xl font-bold mb-1 text-white flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></div>
              Fund SentinelVault
            </h2>
            <p className="text-sm mb-6" style={{ color: S.muted }}>
              Deposit USDC for the AI agent to draw from.
            </p>

            <div className="mb-6">
              <label className="text-xs font-semibold mb-2 block uppercase tracking-wider" style={{ color: S.textPrimary }}>Deposit Amount (USDC)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value)}
                  className="w-full rounded-xl pl-8 pr-4 py-3 outline-none transition-all shadow-inner font-mono font-bold text-lg"
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: `1px solid ${S.border}`, color: '#fff' }}
                  onFocus={e => (e.currentTarget.style.borderColor = S.success)}
                  onBlur={e => (e.currentTarget.style.borderColor = S.border)}
                />
              </div>
            </div>

            <div className="rounded-xl p-4 mb-6 space-y-3 shadow-inner" style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: `1px solid ${S.border}` }}>
              {[
                ['Destination', `Vault: ${VAULT_ADDRESS.slice(0, 6)}...${VAULT_ADDRESS.slice(-4)}`],
                ['Network', NETWORK_LABEL],
                ['Asset', 'USDC (ERC-20)'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center text-sm">
                  <span style={{ color: S.muted }}>{k}</span>
                  <span className="font-mono font-medium" style={{ color: k === 'Asset' ? S.textPrimary : S.accentLight }}>{v}</span>
                </div>
              ))}
            </div>

            <div className="text-xs p-4 rounded-xl mb-6 flex gap-3 items-center" style={{ color: S.muted, backgroundColor: 'rgba(255,255,255,0.03)', border: `1px solid ${S.border}` }}>
              <div className="flex gap-2 items-center flex-1">
                <div className="w-5 h-5 rounded flex items-center justify-center bg-white/10 font-bold text-[10px] text-white">1</div>
                <span>Approve</span>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              <div className="flex gap-2 items-center flex-1 justify-end">
                <div className="w-5 h-5 rounded flex items-center justify-center bg-white/10 font-bold text-[10px] text-white">2</div>
                <span>Deposit</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowFundVault(false)} className="px-4 py-3 rounded-xl text-sm font-semibold transition-all hover:bg-white/5" style={{ border: `1px solid ${S.border}`, color: S.muted }}>
                Cancel
              </button>
              <button
                onClick={handleDeposit}
                disabled={!address || depositStatus === 'approving' || depositStatus === 'depositing'}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                style={{
                  background: depositStatus === 'error' ? 'linear-gradient(90deg, #ef4444, #b91c1c)' : 'linear-gradient(90deg, #10b981, #059669)',
                  boxShadow: depositStatus === 'error' ? '0 4px 15px rgba(239,68,68,0.3)' : '0 4px 15px rgba(16,217,129,0.3)'
                }}
              >
                {depositStatus === 'approving' && <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div> Approving Allowance…</>}
                {depositStatus === 'depositing' && <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div> Securing Deposit…</>}
                {depositStatus === 'done' && <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg> Deposit Confirmed</>}
                {depositStatus === 'error' && '❌ Transaction Failed - Retry'}
                {depositStatus === 'idle' && 'Execute Batch (2 Txs)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MetaMask Delegation Modal (ERC-7715) ── */}
      {showDelegationModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 px-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
          <div className="rounded-2xl p-8 w-full max-w-md relative overflow-hidden" style={{ backgroundColor: '#0a0a12', border: `1px solid rgba(246,133,27,0.4)`, boxShadow: `0 0 40px -10px rgba(246,133,27,0.3)` }}>
            <div className="absolute top-0 inset-x-0 h-1" style={{ background: `linear-gradient(90deg, transparent, #F6851B, transparent)` }}></div>

            <h2 className="text-xl font-bold mb-1 text-white flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-[#F6851B]/20 border border-[#F6851B]/50 flex items-center justify-center text-[#F6851B] font-extrabold text-sm">M</div>
              MetaMask Native Delegation
            </h2>
            <p className="text-sm mb-6" style={{ color: S.muted }}>Generate an ERC-7715 delegation signature to seamlessly grant policies to your autonomous agent via Smart Accounts.</p>

            <div className="space-y-4 mb-6 relative">
              <div className="rounded-xl p-4 shadow-inner text-sm space-y-3" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: `1px solid ${S.border}` }}>
                <div className="flex justify-between border-b pb-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <span style={{ color: S.muted }}>Delegator</span>
                  <span className="font-mono">{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'}</span>
                </div>
                <div className="flex justify-between border-b pb-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <span style={{ color: S.muted }}>Delegatee (Agent)</span>
                  <span className="font-mono text-cyan-400 text-xs">
                    {isAddress(whitelistRecipient)
                      ? `${whitelistRecipient.slice(0, 6)}...${whitelistRecipient.slice(-4)}`
                      : '0xA99F...557D'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: S.muted }}>Caveat (Policy Enforcer)</span>
                  <span className="font-mono text-[#F6851B] font-bold text-xs">5 USDC MAX DAILY</span>
                </div>
              </div>

              {delegationStatus === 'success' && (
                <div className="p-4 rounded-xl relative overflow-hidden border border-emerald-500/30 bg-emerald-500/5">
                  <div className="text-emerald-400 font-bold mb-2 flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    Delegation Signed Successfully!
                  </div>
                  <div className="text-[10px] font-mono leading-relaxed text-emerald-200/70 break-all p-2 bg-black/40 rounded">
                    {delegationSignature}
                  </div>
                </div>
              )}

              {delegationStatus === 'error' && (
                <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/5 text-red-400 text-xs font-medium">
                  {delegationError}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowDelegationModal(false)} className="px-4 py-3 rounded-xl text-sm font-semibold transition-all hover:bg-white/5 flex-1" style={{ border: `1px solid ${S.border}`, color: S.muted }}>
                {delegationStatus === 'success' ? 'Close' : 'Cancel'}
              </button>
              {delegationStatus !== 'success' && (
                <button
                  onClick={handleSignDelegation}
                  disabled={!address || delegationStatus === 'signing'}
                  className="flex-[1.5] px-4 py-3 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-[#F6851B]/20 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(90deg, #F6851B, #E2761B)' }}
                >
                  {delegationStatus === 'signing' ? 'Awaiting Signature in Wallet…' : 'Sign Delegation (EIP-712)'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
