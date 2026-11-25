import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useWallet } from "../wallet/WalletContext";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-3 text-ink no-underline" aria-label="DOGE FC home">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="12.5" fill="#ECEFF4" stroke="#22E4F5" strokeWidth="2" />
        <path d="M14 8.5l4.6 3.3-1.8 5.4h-5.6l-1.8-5.4z" fill="#070B14" />
        <path d="M14 8.5V3.2M18.6 11.8l5-1.6M16.8 17.2l3.1 4.3M11.2 17.2l-3.1 4.3M9.4 11.8l-5-1.6" stroke="#070B14" strokeWidth="1.4" />
      </svg>
      <span className="font-pixel text-[13px] tracking-wide">DOGE FC</span>
    </Link>
  );
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  `pb-1 no-underline ${isActive ? "text-cyan border-b-2 border-cyan" : "text-soft hover:text-ink"}`;

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="border-b border-line2">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <div className="flex flex-wrap items-center gap-6">
          <Logo />
          <nav aria-label="Main" className="flex flex-wrap gap-5 text-[15px]">
            <NavLink to="/club" className={navCls}>Club</NavLink>
            <NavLink to="/play" className={navCls}>Play</NavLink>
            <NavLink to="/" end className={navCls}>About</NavLink>
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {children}
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

export function Eyebrow({ children, className = "text-violet" }: { children: ReactNode; className?: string }) {
  return <span className={`font-pixel text-[11px] leading-relaxed ${className}`}>{children}</span>;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`border border-line bg-surface p-5 sm:p-6 ${className}`}>{children}</section>;
}

export const btnPrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 bg-cyan px-5 font-pixel text-[11px] text-bg no-underline shadow-[4px_4px_0_#0E7C86] hover:bg-[#5BEDF8] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none";
export const btnGhost =
  "inline-flex min-h-11 items-center justify-center gap-2 border border-line bg-transparent px-4 text-[15px] text-ink no-underline hover:border-cyan";

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
    <button type="button" onClick={w.openModal} disabled={w.loading || w.connecting} className="min-h-11 border border-cyan px-4 text-sm font-semibold text-cyan hover:bg-cyan hover:text-bg">
      {w.loading ? "Loading wallet…" : w.connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
