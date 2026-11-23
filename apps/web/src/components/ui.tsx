import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useSave } from "../store";
import { useWallet } from "../wallet/WalletContext";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-3 text-ink no-underline">
      <span className="grid size-7 grid-cols-3 gap-0.5" aria-hidden="true">
        {["c", "c", "w", "w", "c", "c", "v", "w", "c"].map((k, i) => (
          <span key={i} className={k === "c" ? "bg-cyan" : k === "v" ? "bg-violet" : "bg-[#1B2742]"} />
        ))}
      </span>
      <span className="font-pixel text-[13px] tracking-wide">AFTERMAZE</span>
    </Link>
  );
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  `pb-1 no-underline ${isActive ? "text-cyan border-b-2 border-cyan" : "text-soft hover:text-ink"}`;

export function GameHeader() {
  const save = useSave();
  return (
    <header className="border-b border-line2">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div className="flex flex-wrap items-center gap-6">
          <Logo />
          <nav aria-label="Game" className="flex flex-wrap gap-5 text-[15px]">
            <NavLink to="/arena" className={navCls}>Arena</NavLink>
            <NavLink to="/workshop" className={navCls}>Workshop</NavLink>
            <NavLink to="/history" className={navCls}>History</NavLink>
            <NavLink to="/shop" className={navCls}>Shop</NavLink>
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {save.agent && (
            <div className="flex items-center gap-3 font-mono text-[13px]">
              <span className="size-3 bg-cyan shadow-[0_0_8px_#22E4F5]" aria-hidden="true" />
              <span>{save.agent.name}</span>
              <span className="text-muted">· strategy v{save.policies?.active ?? 1}</span>
            </div>
          )}
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <GameHeader />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-6 px-5 pb-12 pt-7 sm:px-8">{children}</main>
    </div>
  );
}

export function Eyebrow({ children, className = "text-violet" }: { children: ReactNode; className?: string }) {
  return <span className={`font-pixel text-[11px] leading-relaxed ${className}`}>{children}</span>;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`border border-line bg-surface p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function Label({ children }: { children: ReactNode }) {
  return <h2 className="m-0 text-sm font-medium uppercase tracking-wider text-muted">{children}</h2>;
}

export function Stat({ label, value, tone = "text-ink" }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex min-w-[120px] flex-col gap-1.5 border border-line bg-surface px-4 py-3">
      <span className="text-xs uppercase tracking-wider text-muted">{label}</span>
      <span className={`font-pixel text-lg ${tone}`}>{value}</span>
    </div>
  );
}

export const btnPrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 bg-cyan px-5 font-pixel text-[11px] text-bg no-underline shadow-[4px_4px_0_#0E7C86] hover:bg-[#5BEDF8] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none";
export const btnGhost =
  "inline-flex min-h-11 items-center justify-center gap-2 border border-line bg-transparent px-4 text-[15px] text-ink no-underline hover:border-cyan";

export const pad = (n: number, len = 6) => String(Math.max(0, Math.floor(n))).padStart(len, "0");

export const WEIGHT_META = [
  { key: "exploration", name: "Exploration", color: "#9B6BFF" },
  { key: "survival", name: "Survival", color: "#3CF28B" },
  { key: "efficiency", name: "Efficiency", color: "#22E4F5" },
  { key: "aggression", name: "Aggression", color: "#FF3B5C" },
  { key: "resourcefulness", name: "Resourcefulness", color: "#FFB020" },
] as const;

export const MODE_LABEL: Record<string, string> = {
  daily: "Daily Maze",
  survival: "Survival",
  special: "Special Maze",
  endless: "Endless Grid",
  training: "Training",
};

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function WalletButton() {
  const w = useWallet();
  if (w.connected && w.address) {
    return (
      <button type="button" onClick={w.openModal} className="min-h-11 border border-line px-3 font-mono text-[13px] text-ink hover:border-cyan">
        {short(w.address)}
      </button>
    );
  }
  return (
    <button type="button" onClick={w.openModal} disabled={w.loading || w.connecting} className="min-h-11 bg-cyan px-4 text-sm font-semibold text-bg">
      {w.loading ? "Loading wallet…" : w.connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
