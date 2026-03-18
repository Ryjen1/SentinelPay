'use client';

import { useState } from 'react';
import { useAccount, useConnect, useDisconnect, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';

const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC as `0x${string}` | undefined;
const USDC_ABI = [
  {
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export default function ConnectButton() {
  const { address } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const [localError, setLocalError] = useState<string | null>(null);

  const getFriendlyError = (message: string) => {
    if (message.toLowerCase().includes('provider not found')) {
      return 'No injected wallet found. Install MetaMask or use WalletConnect.';
    }
    return message;
  };

  const { data: usdcBalance } = useReadContract({
    address: (USDC_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!USDC_ADDRESS }
  });

  if (address) {
    return (
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-xs font-mono text-white">
            {address?.slice(0, 6)} ... {address?.slice(-4)}
          </div>
          <div className="text-xs" style={{ color: '#A78BFA' }}>
            {typeof usdcBalance === 'bigint' ? Number(formatUnits(usdcBalance, 6)).toFixed(2) : '0.00'} USDC
          </div>
        </div>
        <button
          onClick={() => disconnect()}
          className="text-xs border border-gray-700 hover:border-red-700 text-gray-400 hover:text-red-400 px-3 py-1.5 rounded-lg transition"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => {
          setLocalError(null);
          const connector = connectors.find(c => c.id === 'injected') ?? connectors[0];
          if (!connector) {
            setLocalError('No wallet connector available');
            return;
          }
          connect(
            { connector },
            {
              onError: (err) => {
                setLocalError(getFriendlyError(err.message));
              },
            }
          );
        }}
        disabled={isPending}
        className="text-[0.6rem] uppercase tracking-widest font-semibold text-white px-5 py-3 rounded-sm transition-all duration-200 hover:bg-white/[0.08]"
        style={{
          border: '1px solid rgba(255,255,255,0.65)',
          fontFamily: 'var(--font-display)',
        }}
      >
        {isPending ? 'CONNECTING...' : 'CONNECT WALLET'}
      </button>
      {connectors.some(c => c.id === 'walletConnect') && (
        <button
          onClick={() => {
            setLocalError(null);
            const connector = connectors.find(c => c.id === 'walletConnect');
            if (!connector) return;
            connect(
              { connector },
              {
                onError: (err) => {
                  setLocalError(getFriendlyError(err.message));
                },
              }
            );
          }}
          disabled={isPending}
          className="text-xs border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#7C3AED';
            e.currentTarget.style.color = '#A78BFA';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgb(55,65,81)';
            e.currentTarget.style.color = 'rgb(209,213,219)';
          }}
        >
          Use WalletConnect
        </button>
      )}
      {(localError || error?.message) && (
        <div className="text-xs" style={{ color: '#ef4444', maxWidth: 260 }}>
          {localError || getFriendlyError(error?.message || '')}
        </div>
      )}
    </div>
  );
}
