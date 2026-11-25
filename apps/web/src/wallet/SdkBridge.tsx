import { useEffect, useRef, useState } from "react";
import {
  WalletConnectProvider,
  getChains,
  useAccount,
  useWalletConnect,
  type WalletConnectKitConfig,
} from "@dogeos/dogeos-sdk";
import "@dogeos/dogeos-sdk/style.css";
import type { WalletState } from "./WalletContext";

/** Public value; override per environment with VITE_DOGEOS_CLIENT_ID. */
const CLIENT_ID =
  (import.meta.env.VITE_DOGEOS_CLIENT_ID as string | undefined) ??
  "0nZHZGBE69EEl6MxFkkmN3iIoNkGckdDEx0Y7JyHpx3IFPg8Zp9MjqvuuKXmAYKPuLC9faLifmFdzgeqLTW5rQDI";

const CHIKYU_ID = 6281971;

function Bridge({ onChange }: { onChange: (s: WalletState) => void }) {
  const wc = useWalletConnect();
  const acct = useAccount();
  const address = (acct.address || null) as `0x${string}` | null;
  // The SDK may hand back new function objects on every render: keep the latest in refs
  // and only publish when the actual wallet state changes (avoids an update loop).
  const fns = useRef({ openModal: wc.openModal, disconnect: wc.disconnect });
  fns.current = { openModal: wc.openModal, disconnect: wc.disconnect };
  const connected = wc.isConnected && !!address;
  const error = wc.error ? String(wc.error) : null;
  const provider = connected ? acct.currentProvider ?? null : null;
  useEffect(() => {
    onChange({
      loading: false,
      connected,
      connecting: !!wc.isConnecting,
      address: connected ? address : null,
      provider,
      error,
      openModal: () => fns.current.openModal(),
      disconnect: () => void fns.current.disconnect(),
    });
  }, [connected, wc.isConnecting, error, address, provider, onChange]);
  return null;
}

export default function SdkBridge({ onChange }: { onChange: (s: WalletState) => void }) {
  const [config, setConfig] = useState<WalletConnectKitConfig | null>(null);

  useEffect(() => {
    let alive = true;
    const base: WalletConnectKitConfig = {
      clientId: CLIENT_ID,
      defaultConnectChain: "evm" as WalletConnectKitConfig["defaultConnectChain"],
      metadata: {
        name: "DOGE FC",
        description: "Manage a squad of AI footballers on DogeOS.",
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.svg`],
      },
    };
    getChains()
      .then((all) => {
        // Prefer DogeOS Chikyū only, if the DogeOS backend lists it.
        const evm = (all.evm ?? []) as { id: number }[];
        const chikyu = evm.filter((c) => Number(c.id) === CHIKYU_ID);
        const chains = chikyu.length ? { evm: chikyu } : all;
        if (alive) setConfig({ ...base, chains: chains as WalletConnectKitConfig["chains"] });
      })
      .catch(() => alive && setConfig(base));
    return () => {
      alive = false;
    };
  }, []);

  if (!config) return null;
  return (
    <WalletConnectProvider config={config}>
      <Bridge onChange={onChange} />
    </WalletConnectProvider>
  );
}
