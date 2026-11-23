import { useState } from "react";
import { Link } from "react-router-dom";
import { formatEther } from "viem";
import { SPECIAL_MAZES } from "@aftermaze/engine";
import { ADDR, CATALOG, FAUCET, PERSONALITY_INDEX, SPECIAL_ENTRY_ID, addressUrl, economyAbi, registryAbi, txUrl } from "../chain/config";
import { Eyebrow, Label, Page, Panel, btnGhost, btnPrimary, short } from "../components/ui";
import { equipSkin, specialUsedBy, useSave } from "../store";
import { useWallet } from "../wallet/WalletContext";
import { useChain } from "../wallet/useChain";
import { explainError, writeAndWait } from "../wallet/tx";

const doge = (v: bigint) => `${Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 3 })} DOGE`;

type Busy = { key: string; label: string } | null;

export function Shop() {
  const save = useSave();
  const wallet = useWallet();
  const chain = useChain();
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);

  const run = async (key: string, label: string, fn: () => Promise<`0x${string}`>, done: string) => {
    setBusy({ key, label });
    setNotice(null);
    try {
      const hash = await fn();
      setNotice({ ok: true, text: done, hash });
      await chain.refresh();
    } catch (e) {
      setNotice({ ok: false, text: explainError(e) });
    } finally {
      setBusy(null);
    }
  };

  const register = () =>
    run(
      "register",
      "Registering your agent…",
      () =>
        writeAndWait(wallet.provider, wallet.address!, {
          address: ADDR.AgentRegistry,
          abi: registryAbi,
          functionName: "createAgent",
          args: [save.agent!.name, PERSONALITY_INDEX[save.agent!.personality]],
        }),
      `${save.agent?.name} is registered to your wallet on DogeOS.`,
    );

  const buy = (id: bigint, price: bigint, name: string) =>
    run(
      `buy-${id}`,
      `Buying ${name}…`,
      () => writeAndWait(wallet.provider, wallet.address!, { address: ADDR.MazeEconomy, abi: economyAbi, functionName: "buy", args: [id], value: price }),
      `Purchased: ${name}.`,
    );

  const used = wallet.address ? specialUsedBy(wallet.address) : 0;
  const available = Math.max(0, Number(chain.specialEntries) - used);
  const canTransact = wallet.connected && chain.registered === true && !busy;

  return (
    <Page>
      <p className="m-0 border border-amber bg-[#2A1E04] px-5 py-3 text-center font-mono text-[13px] text-[#FFD27A]">
        DogeOS Chikyū testnet · Testnet DOGE has no real-world monetary value
      </p>
      <div className="flex flex-col gap-1.5">
        <Eyebrow>SHOP</Eyebrow>
        <h1 className="m-0 text-3xl font-bold">DOGE economy</h1>
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        <Panel className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-muted">Your wallet</span>
          {wallet.connected && wallet.address ? (
            <>
              <span className="font-pixel text-lg">{chain.balance === null ? "…" : doge(chain.balance)}</span>
              <span className="font-mono text-[13px] text-soft">
                <a href={addressUrl(wallet.address)} target="_blank" rel="noreferrer">{short(wallet.address)}</a> ·{" "}
                <a href={FAUCET} target="_blank" rel="noreferrer">Get testnet DOGE</a>
              </span>
            </>
          ) : (
            <button type="button" className={`${btnPrimary} self-start`} onClick={wallet.openModal} disabled={wallet.loading}>
              {wallet.loading ? "LOADING…" : "CONNECT WALLET"}
            </button>
          )}
        </Panel>
        <Panel className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-muted">Agent on-chain</span>
          {!wallet.connected ? (
            <span className="text-soft">Connect a wallet to register your agent.</span>
          ) : !save.agent ? (
            <Link to="/create" className={btnGhost}>Create an agent first</Link>
          ) : chain.registered === null ? (
            <span className="text-soft">Checking…</span>
          ) : chain.registered ? (
            <span className="font-pixel text-sm text-ok">{chain.onchainName?.toUpperCase()} ✓ REGISTERED</span>
          ) : (
            <>
              <span className="text-sm text-soft">Free, one per wallet. Needed before buying.</span>
              <button type="button" className={`${btnPrimary} self-start`} onClick={register} disabled={!!busy}>
                REGISTER {save.agent.name.toUpperCase()}
              </button>
            </>
          )}
        </Panel>
        <Panel className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-wider text-muted">Reward reserve (on-chain)</span>
          <span className="font-pixel text-lg text-ok">{chain.reserveBalance === null ? "…" : doge(chain.reserveBalance)}</span>
          <span className="text-[13px] text-soft">Achievement rewards are claimed from here once the game server is live.</span>
        </Panel>
      </div>

      {(busy || notice || chain.error) && (
        <div role="status" className={`border px-5 py-3 text-[15px] ${busy ? "border-cyan text-cyan" : notice?.ok ? "border-ok text-ok" : "border-danger text-danger"}`}>
          {busy ? `${busy.label} Confirm in your wallet, then wait for DogeOS to confirm.` : notice ? notice.text : chain.error}
          {notice?.hash && (
            <>
              {" "}
              <a href={txUrl(notice.hash)} target="_blank" rel="noreferrer">View transaction</a>
            </>
          )}
        </div>
      )}

      <section className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Eyebrow>FOR SALE · PRICES READ FROM THE CONTRACT</Eyebrow>
          <span className="text-sm text-muted">Cosmetics never change how your agent plays.</span>
        </div>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          {CATALOG.map((c) => {
            const info = chain.items.find((i) => i.id === c.id);
            const isSpecial = c.id === SPECIAL_ENTRY_ID;
            const owned = !isSpecial && info?.owned;
            const equipped = save.equippedSkin === c.id.toString();
            return (
              <div key={c.id.toString()} className="flex flex-col gap-3 border border-line bg-surface p-5">
                <div className="flex h-20 items-center justify-center gap-1 bg-[#0A1122]" aria-hidden="true">
                  <span className="size-3.5 opacity-25" style={{ background: c.color }} />
                  <span className="size-3.5 opacity-50" style={{ background: c.color }} />
                  <span className="size-8 rounded" style={{ background: c.color, boxShadow: `0 0 14px ${c.color}` }} />
                </div>
                <h3 className="m-0 text-xl font-semibold">{c.name}</h3>
                <p className="m-0 flex-grow text-[15px] leading-normal text-soft">{c.description}</p>
                {isSpecial && wallet.connected && (
                  <span className="font-mono text-[13px] text-soft">
                    Bought {chain.specialEntries.toString()} · used {used} · <span className="text-amber">{available} available</span>
                  </span>
                )}
                <div className="flex flex-wrap items-center gap-2.5">
                  {!info ? (
                    <span className="text-sm text-muted">{chain.loading ? "Loading price…" : "Unavailable"}</span>
                  ) : !info.exists || !info.active ? (
                    <span className="text-sm text-muted">Not on sale</span>
                  ) : owned ? (
                    <button type="button" className={btnGhost} onClick={() => equipSkin(equipped ? null : c.id.toString())}>
                      {equipped ? "Unequip" : "Equip"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center gap-3 bg-amber px-4 font-pixel text-[10px] text-bg"
                      disabled={!canTransact}
                      onClick={() => buy(c.id, info.price, c.name)}
                    >
                      {busy?.key === `buy-${c.id}` ? "BUYING…" : `BUY · ${doge(info.price)}`}
                    </button>
                  )}
                  {owned && <span className="font-pixel text-[9px] text-ok">OWNED{equipped ? " · EQUIPPED" : ""}</span>}
                  {!wallet.connected && info?.exists && !owned && <span className="text-sm text-muted">Connect a wallet to buy</span>}
                  {wallet.connected && chain.registered === false && !owned && <span className="text-sm text-muted">Register your agent first</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3.5">
        <Eyebrow>SPECIAL MAZES · ONE ENTRY EACH RUN</Eyebrow>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {Object.values(SPECIAL_MAZES).map((m) => (
            <div key={m.key} className="flex flex-col gap-2 border border-line bg-surface p-5">
              <h3 className="m-0 text-lg font-semibold">{m.name}</h3>
              <p className="m-0 text-[15px] leading-normal text-soft">{m.description}</p>
            </div>
          ))}
        </div>
        <p className="m-0 text-sm text-muted">
          Play them from the <Link to="/arena">Arena</Link>. Purchases are recorded on-chain. Until the game server is live, which entries you've used is tracked in this browser.
        </p>
      </section>

      <Panel className="flex flex-col gap-3">
        <Label>Contracts on DogeOS Chikyū (chain 6281971)</Label>
        {Object.entries(ADDR).map(([name, addr]) => (
          <div key={name} className="flex flex-wrap justify-between gap-2 border-b border-line2 pb-2">
            <span>{name}</span>
            <a href={`${addressUrl(addr)}#code`} target="_blank" rel="noreferrer" className="break-all font-mono text-sm">{addr}</a>
          </div>
        ))}
      </Panel>
    </Page>
  );
}
