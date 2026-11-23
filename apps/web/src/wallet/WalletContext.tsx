import { createContext, lazy, Suspense, useContext, useMemo, useState, type ReactNode } from "react";

export interface WalletState {
  /** SDK still downloading / initialising. */
  loading: boolean;
  connected: boolean;
  connecting: boolean;
  address: `0x${string}` | null;
  /** EIP-1193 provider of the connected wallet. */
  provider: unknown | null;
  error: string | null;
  openModal: () => void;
  disconnect: () => void;
}

const initial: WalletState = {
  loading: true,
  connected: false,
  connecting: false,
  address: null,
  provider: null,
  error: null,
  openModal: () => {},
  disconnect: () => {},
};

const Ctx = createContext<WalletState>(initial);
export const useWallet = () => useContext(Ctx);

// The SDK is large, so it loads after the page has rendered and runs beside the app.
const SdkBridge = lazy(() => import("./SdkBridge"));

export function WalletRoot({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(initial);
  const value = useMemo(() => state, [state]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <SdkBridge onChange={setState} />
      </Suspense>
    </Ctx.Provider>
  );
}
