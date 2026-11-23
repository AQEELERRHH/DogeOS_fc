import {
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  custom,
  type Abi,
  type EIP1193Provider,
  numberToHex,
  UserRejectedRequestError,
} from "viem";
import { chikyu, publicClient } from "../chain/config";

type Provider = EIP1193Provider;

/** Puts the wallet on DogeOS Chikyū, adding the network if the wallet doesn't know it. */
export async function ensureChikyu(provider: Provider) {
  const want = numberToHex(chikyu.id);
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (current?.toLowerCase() === want) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: want }] });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code !== 4902 && code !== -32603) throw e;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: want,
          chainName: chikyu.name,
          nativeCurrency: chikyu.nativeCurrency,
          rpcUrls: chikyu.rpcUrls.default.http,
          blockExplorerUrls: [chikyu.blockExplorers!.default.url],
        },
      ],
    });
  }
}

export interface WriteArgs {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

/**
 * Simulates first (so contract errors show before the wallet prompt), then sends
 * and waits for confirmation. Never trusts the UI for price: callers pass the
 * price read from the contract.
 */
export async function writeAndWait(provider: unknown, account: `0x${string}`, w: WriteArgs) {
  const p = provider as Provider;
  await ensureChikyu(p);
  const { request } = await publicClient.simulateContract({ ...w, account } as Parameters<typeof publicClient.simulateContract>[0]);
  const wallet = createWalletClient({ account, chain: chikyu, transport: custom(p) });
  const hash = await wallet.writeContract(request as Parameters<typeof wallet.writeContract>[0]);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The transaction was reverted on-chain.");
  return hash;
}

const FRIENDLY: Record<string, string> = {
  NoAgent: "Register your agent on-chain first.",
  AlreadyOwned: "You already own this item.",
  WrongPayment: "The price changed. Refresh and try again.",
  ItemInactive: "This item isn't on sale right now.",
  UnknownItem: "This item doesn't exist on-chain.",
  EnforcedPause: "The shop is paused right now.",
  AlreadyRegistered: "This wallet already has an agent registered.",
  InvalidName: "Agent names must be 1–24 characters.",
};

/** Turns wallet / contract errors into a sentence a player can act on. */
export function explainError(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return "You cancelled the request in your wallet.";
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = revert?.data?.errorName;
    if (name) return FRIENDLY[name] ?? `The contract refused: ${name}.`;
    if (/insufficient funds/i.test(e.message)) return "Not enough testnet DOGE for this purchase plus gas. Top up from the faucet.";
    return e.shortMessage || e.message;
  }
  const code = (e as { code?: number })?.code;
  if (code === 4001) return "You cancelled the request in your wallet.";
  return e instanceof Error ? e.message : String(e);
}
