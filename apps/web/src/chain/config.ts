import { createPublicClient, defineChain, http } from "viem";

/** DogeOS Chikyū testnet. */
export const chikyu = defineChain({
  id: 6281971,
  name: "DogeOS Chikyū Testnet",
  nativeCurrency: { name: "Dogecoin", symbol: "DOGE", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.dogeos.com/"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://blockscout.testnet.dogeos.com" } },
  testnet: true,
});

export const EXPLORER = chikyu.blockExplorers.default.url;
export const FAUCET = "https://faucet.testnet.dogeos.com/";
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (a: string) => `${EXPLORER}/address/${a}`;

export const publicClient = createPublicClient({ chain: chikyu, transport: http() });
