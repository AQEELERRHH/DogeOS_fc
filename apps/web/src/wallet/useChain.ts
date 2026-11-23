import { useCallback, useEffect, useState } from "react";
import { ADDR, CATALOG, SPECIAL_ENTRY_ID, economyAbi, publicClient, registryAbi } from "../chain/config";
import { useWallet } from "./WalletContext";

export interface ItemInfo {
  id: bigint;
  price: bigint;
  kind: number;
  active: boolean;
  exists: boolean;
  owned: boolean;
}

export interface ChainState {
  loading: boolean;
  error: string | null;
  balance: bigint | null;
  registered: boolean | null;
  onchainName: string | null;
  items: ItemInfo[];
  specialEntries: bigint;
  reserveBalance: bigint | null;
  refresh: () => Promise<void>;
}

/** Reads everything the game needs from DogeOS Chikyū for the connected wallet. */
export function useChain(): ChainState {
  const { address } = useWallet();
  const [s, setS] = useState<Omit<ChainState, "refresh">>({
    loading: false,
    error: null,
    balance: null,
    registered: null,
    onchainName: null,
    items: [],
    specialEntries: 0n,
    reserveBalance: null,
  });

  const refresh = useCallback(async () => {
    setS((x) => ({ ...x, loading: true, error: null }));
    try {
      const reserveBalance = await publicClient.getBalance({ address: ADDR.RewardReserve });
      const items = await Promise.all(
        CATALOG.map(async (c) => {
          const [price, kind, active, exists] = await publicClient.readContract({ address: ADDR.MazeEconomy, abi: economyAbi, functionName: "items", args: [c.id] });
          const owned = address
            ? await publicClient.readContract({ address: ADDR.MazeEconomy, abi: economyAbi, functionName: "owns", args: [address, c.id] })
            : false;
          return { id: c.id, price, kind, active, exists, owned };
        }),
      );
      if (!address) {
        setS({ loading: false, error: null, balance: null, registered: null, onchainName: null, items, specialEntries: 0n, reserveBalance });
        return;
      }
      const [balance, registered, specialEntries] = await Promise.all([
        publicClient.getBalance({ address }),
        publicClient.readContract({ address: ADDR.AgentRegistry, abi: registryAbi, functionName: "hasAgent", args: [address] }),
        publicClient.readContract({ address: ADDR.MazeEconomy, abi: economyAbi, functionName: "entriesPurchased", args: [address, SPECIAL_ENTRY_ID] }),
      ]);
      const onchainName = registered
        ? (await publicClient.readContract({ address: ADDR.AgentRegistry, abi: registryAbi, functionName: "getAgent", args: [address] })).name
        : null;
      setS({ loading: false, error: null, balance, registered, onchainName, items, specialEntries, reserveBalance });
    } catch (e) {
      setS((x) => ({ ...x, loading: false, error: "Couldn't reach DogeOS Chikyū. Check your connection and try again." }));
      console.warn(e);
    }
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...s, refresh };
}
