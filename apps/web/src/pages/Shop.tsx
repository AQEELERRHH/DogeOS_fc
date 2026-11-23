import { SPECIAL_MAZES } from "@aftermaze/engine";
import { Eyebrow, Label, Page, Panel } from "../components/ui";
import deployments from "../../../../contracts/deployments/dogeosChikyu.json";

const EXPLORER = "https://blockscout.testnet.dogeos.com";
const COSMETICS = [
  { kind: "AGENT SKIN", name: "Ember", color: "#FF7A3D" },
  { kind: "AGENT SKIN", name: "Phantom", color: "#C9D3E6" },
  { kind: "MOVEMENT TRAIL", name: "Static Rain", color: "#3CF28B" },
  { kind: "NAMEPLATE", name: "Gridrunner", color: "#FFB020" },
];

export function Shop() {
  const contracts = [
    ["AgentRegistry", deployments.AgentRegistry],
    ["MazeEconomy", deployments.MazeEconomy],
    ["RewardReserve", deployments.RewardReserve],
    ["MatchResults", deployments.MatchResults],
  ];
  return (
    <Page>
      <p className="m-0 border border-amber bg-[#2A1E04] px-5 py-3 text-center font-mono text-[13px] text-[#FFD27A]">
        DogeOS Chikyū testnet · Testnet DOGE has no real-world monetary value
      </p>
      <div className="flex flex-col gap-1.5">
        <Eyebrow>SHOP</Eyebrow>
        <h1 className="m-0 text-3xl font-bold">DOGE economy</h1>
        <p className="m-0 max-w-3xl text-soft">
          Wallet login, purchases and reward claims arrive in the next update. The contracts below are already deployed and verified, and the catalogue
          shows what will be for sale.
        </p>
      </div>

      <section className="flex flex-col gap-3.5">
        <Eyebrow>SPECIAL MAZES · 1 DOGE ENTRY</Eyebrow>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
          {Object.values(SPECIAL_MAZES).map((m) => (
            <div key={m.key} className="flex flex-col gap-2.5 border border-line bg-surface p-5">
              <h3 className="m-0 text-xl font-semibold">{m.name}</h3>
              <p className="m-0 text-[15px] leading-normal text-soft">{m.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Eyebrow>COSMETICS · 2 DOGE</Eyebrow>
          <span className="text-sm text-muted">Looks only. Cosmetics never change how your agent plays.</span>
        </div>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          {COSMETICS.map((c) => (
            <div key={c.name} className="flex flex-col gap-3 border border-line bg-surface p-4">
              <div className="flex h-20 items-center justify-center gap-1 bg-[#0A1122]" aria-hidden="true">
                <span className="size-3.5 opacity-25" style={{ background: c.color }} />
                <span className="size-3.5 opacity-50" style={{ background: c.color }} />
                <span className="size-8 rounded" style={{ background: c.color, boxShadow: `0 0 14px ${c.color}` }} />
              </div>
              <span className="font-pixel text-[9px] text-muted">{c.kind}</span>
              <h3 className="m-0 text-lg font-semibold">{c.name}</h3>
            </div>
          ))}
        </div>
      </section>

      <Panel className="flex flex-col gap-3">
        <Label>Contracts on DogeOS Chikyū (chain 6281971)</Label>
        {contracts.map(([name, addr]) => (
          <div key={name} className="flex flex-wrap justify-between gap-2 border-b border-line2 pb-2">
            <span>{name}</span>
            <a href={`${EXPLORER}/address/${addr}#code`} target="_blank" rel="noreferrer" className="break-all font-mono text-sm">{addr}</a>
          </div>
        ))}
      </Panel>
    </Page>
  );
}
