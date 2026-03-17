import { createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { defineChain } from 'viem';

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '11142220');
const chainName = process.env.NEXT_PUBLIC_CHAIN_NAME ?? 'Celo Sepolia';
const explorerBaseUrl = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL ?? 'https://sepolia.celoscan.io';

// ── RPC URL ───────────────────────────────────────────────────────────────────
// Must be set via NEXT_PUBLIC_CELO_RPC_URL (e.g. a Forno, Alchemy, or Infura endpoint).
const celoRpcUrl = process.env.NEXT_PUBLIC_CELO_RPC_URL || 'https://forno.celo.org'; // Fallback for build phase

export const celoChain = defineChain({
  id: chainId,
  name: chainName,
  nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
  rpcUrls: {
    default: { http: [celoRpcUrl] },
  },
  blockExplorers: {
    default: { name: 'Celoscan', url: explorerBaseUrl },
  },
});

// ── Connectors ────────────────────────────────────────────────────────────────
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const connectors = [
  injected({ shimDisconnect: true }),
  ...(walletConnectProjectId
    ? [
      walletConnect({
        projectId: walletConnectProjectId,
        metadata: {
          name: 'SentinelPay',
          description: 'SentinelPay dashboard wallet connection',
          url: 'http://localhost:3000',
          icons: [`${explorerBaseUrl}/favicon.ico`],
        },
        showQrModal: true,
      }),
    ]
    : []),
];

// ── Wagmi config ──────────────────────────────────────────────────────────────
export const config = createConfig({
  chains: [celoChain],
  connectors,
  transports: {
    [celoChain.id]: http(celoRpcUrl),
  },
  ssr: true,
});
