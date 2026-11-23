import { Suspense, lazy } from "react";
import { Link } from "react-router-dom";
import { PERSONALITIES, SPECIAL_MAZES, type Personality } from "@aftermaze/engine";
import { Eyebrow, Logo, WEIGHT_META, btnPrimary } from "../components/ui";
import { useSave } from "../store";

const DemoPreview = lazy(() => import("../components/DemoPreview"));

const SPRITE = [
  ".....aa.....",
  ".....kk.....",
  "...kkkkkk...",
  "..kbbbbbbk..",
  "..kbccccbk..",
  "..kbcwcwbk..",
  "..kbbbbbbk..",
  "...kkddkk...",
  "..kvbbbbvk..",
  "..kbbddbbk..",
  "..kdk..kdk..",
  "..kk....kk..",
];
const PAL: Record<string, string> = { k: "#04070E", b: "#C9D3E6", d: "#7D8AA5", c: "#22E4F5", w: "#E9FDFF", v: "#9B6BFF", a: "#FFB020" };

export function NovaSprite({ size = 14 }: { size?: number }) {
  return (
    <div role="img" aria-label="NOVA, a small pixel-art agent with a cyan visor" className="grid shrink-0" style={{ gridTemplateColumns: `repeat(12, ${size}px)` }}>
      {SPRITE.join("").split("").map((ch, i) => (
        <span key={i} style={{ width: size, height: size, background: PAL[ch] ?? "transparent" }} />
      ))}
    </div>
  );
}

function Section({ id, children, alt = false }: { id?: string; children: React.ReactNode; alt?: boolean }) {
  return (
    <section id={id} className={`border-t border-line2 ${alt ? "bg-bg2" : ""}`}>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-10 px-5 py-20 sm:px-8">{children}</div>
    </section>
  );
}

export function Landing() {
  const save = useSave();
  const enter = save.agent ? "/arena" : "/create";
  return (
    <div>
      <header className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <Logo />
        <nav aria-label="Main" className="flex flex-wrap items-center gap-6 text-[15px]">
          <a href="#how" className="text-soft no-underline hover:text-ink">How it works</a>
          <a href="#trail" className="text-soft no-underline hover:text-ink">Echo Trail</a>
          <a href="#modes" className="text-soft no-underline hover:text-ink">Modes</a>
          <a href="#doge" className="text-soft no-underline hover:text-ink">DOGE economy</a>
          <Link to={enter} className="inline-flex min-h-11 items-center bg-cyan px-4 font-semibold text-bg no-underline">{save.agent ? "Play" : "Create your agent"}</Link>
        </nav>
      </header>

      <section className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-14 px-5 pb-24 pt-10 sm:px-8">
        <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-7">
          <div className="inline-flex items-center gap-2.5 self-start border border-line px-3 py-2 font-mono text-[13px] text-soft">
            <span className="size-2 bg-ok shadow-[0_0_8px_#3CF28B]" aria-hidden="true" />
            Built for DogeOS Chikyū testnet
          </div>
          <h1 className="m-0 font-pixel text-[26px] leading-[1.4] tracking-wide sm:text-[38px]">
            THE MAZE IS ALIVE.
            <br />
            <span className="text-cyan">YOUR AGENT MUST ADAPT.</span>
          </h1>
          <p className="m-0 max-w-[560px] text-xl leading-relaxed text-soft">
            Build an autonomous agent. Train it through experience. Send it into THE GRID and see if it can survive.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link to={enter} className={`${btnPrimary} px-6 py-4 text-[13px]`}>ENTER THE GRID</Link>
            <a href="#how" className="inline-flex min-h-11 items-center border-2 border-violet px-5 py-4 font-pixel text-[13px] text-ink no-underline">EXPLORE THE ARENA</a>
          </div>
          <p className="m-0 font-mono text-[13px] text-muted">You don't steer. You coach. Your agent decides every move on its own.</p>
        </div>
        <div className="flex min-w-0 flex-[1_1_500px] justify-center">
          <Suspense fallback={<div className="aspect-[19/13] w-full max-w-[640px] border-2 border-line bg-surface" />}>
            <DemoPreview />
          </Suspense>
        </div>
      </section>

      <Section id="how" alt>
        <div className="flex flex-col gap-3">
          <Eyebrow>01 / HOW AFTERMAZE WORKS</Eyebrow>
          <h2 className="m-0 text-4xl font-bold">One agent. Infinite mazes. Zero joysticks.</h2>
        </div>
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {[
            ["Create NOVA", "Name your agent and pick a personality: Explorer, Survivor, Speedrunner or Aggressive."],
            ["Send it into THE GRID", "NOVA hunts three energy crystals, dodges Seekers and Sentinels, and races collapsing corridors to the exit."],
            ["Coach it in plain words", "\"Stop wasting bombs.\" \"Avoid narrow corridors when the Seeker is close.\" NOVA shows exactly what it understood."],
            ["Watch it learn", "After every run NOVA replays its recent mazes, tests small strategy changes and keeps only what works."],
          ].map(([t, b], i) => (
            <div key={t} className="flex flex-col gap-3.5 border border-line bg-surface p-7">
              <span className="font-pixel text-lg text-cyan">{i + 1}</span>
              <h3 className="m-0 text-[22px] font-semibold">{t}</h3>
              <p className="m-0 leading-relaxed text-soft">{b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="trail">
        <div className="flex flex-wrap items-center gap-14">
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-4">
            <Eyebrow>02 / SIGNATURE MECHANIC</Eyebrow>
            <h2 className="m-0 text-4xl font-bold">The Echo Trail</h2>
            <p className="m-0 text-lg leading-relaxed text-soft">Every step NOVA takes leaves a trail. The two newest tiles stay open. Older tiles crystallise into walls until they dissolve or a pulse bomb shatters them.</p>
            <p className="m-0 text-lg leading-relaxed text-soft">A careless route can box NOVA in. A clever one can wall off a Seeker.</p>
          </div>
          <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-5">
            <div className="flex" aria-hidden="true">
              {["x", "x", "x", "~", "~", "N", "."].map((c, i) => (
                <div key={i} className={`grid size-12 place-items-center sm:size-16 ${c === "x" ? "bg-[#2A1F55] shadow-[inset_0_0_0_2px_#9B6BFF]" : "bg-[#0A1122]"}`}>
                  {c === "~" && <span className="size-1/2 bg-cyan opacity-35" />}
                  {c === "N" && <span className="size-2/3 bg-cyan shadow-[0_0_16px_#22E4F5]" />}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-6 font-mono text-[13px] text-soft">
              <span className="flex items-center gap-2"><span className="size-3.5 bg-[#2A1F55] shadow-[inset_0_0_0_2px_#9B6BFF]" />Crystallised (blocks everyone)</span>
              <span className="flex items-center gap-2"><span className="size-3.5 bg-cyan opacity-35" />Last 2 tiles (still open)</span>
              <span className="flex items-center gap-2"><span className="size-3.5 bg-cyan" />NOVA</span>
            </div>
          </div>
        </div>
      </Section>

      <Section alt>
        <div className="flex flex-wrap items-center gap-10">
          <NovaSprite />
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3">
            <Eyebrow>03 / MEET NOVA</Eyebrow>
            <h2 className="m-0 text-4xl font-bold">Pick a personality. It's a starting point, not a power level.</h2>
            <p className="m-0 text-lg leading-relaxed text-soft">Every personality has the same total strength, spread across five behaviours. Coaching and experience reshape it from there.</p>
          </div>
        </div>
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
          {(Object.keys(PERSONALITIES) as Personality[]).map((k) => (
            <div key={k} className="flex flex-col gap-3.5 border border-line bg-surface p-6">
              <h3 className="m-0 font-pixel text-[13px] text-cyan">{PERSONALITIES[k].label.toUpperCase()}</h3>
              <p className="m-0 text-[15px] leading-normal text-soft">{PERSONALITIES[k].description}</p>
              <div className="flex flex-col gap-2">
                {WEIGHT_META.map((w) => (
                  <div key={w.key} className="grid grid-cols-[120px_1fr_28px] items-center gap-2.5 font-mono text-xs text-soft">
                    <span>{w.name}</span>
                    <div className="h-2 bg-line2"><div className="h-2" style={{ width: `${PERSONALITIES[k].weights[w.key]}%`, background: w.color }} /></div>
                    <span className="text-right text-ink">{PERSONALITIES[k].weights[w.key]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="modes">
        <div className="flex flex-col gap-3">
          <Eyebrow>04 / MODES</Eyebrow>
          <h2 className="m-0 text-4xl font-bold">Your rival is the maze, and NOVA's last run.</h2>
        </div>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          {[
            ["Daily Maze", "One fixed-seed maze per day. Same layout for every player."],
            ["Survival", "Each escape unlocks a harder maze. How far can NOVA climb?"],
            ["Endless Grid", "Floor after floor. HP carries over. One mistake ends the run."],
            ["Training", "Pick any difficulty and experiment freely."],
          ].map(([t, b]) => (
            <div key={t} className="flex flex-col gap-2.5 border border-line p-6">
              <span className="font-pixel text-[11px] text-ok">FREE</span>
              <h3 className="m-0 text-xl font-semibold">{t}</h3>
              <p className="m-0 text-[15px] leading-normal text-soft">{b}</p>
            </div>
          ))}
          <div className="flex flex-col gap-2.5 border border-violet p-6">
            <span className="font-pixel text-[11px] text-amber">DOGE</span>
            <h3 className="m-0 text-xl font-semibold">Special Mazes</h3>
            <p className="m-0 text-[15px] leading-normal text-soft">{Object.values(SPECIAL_MAZES).map((m) => m.name).join(", ")}.</p>
          </div>
        </div>
      </Section>

      <Section id="doge" alt>
        <div className="flex flex-col gap-3">
          <Eyebrow>05 / DOGE-POWERED</Eyebrow>
          <h2 className="m-0 text-4xl font-bold">One currency. Real reserves. No pay-to-win.</h2>
        </div>
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
          <div className="flex flex-col gap-3.5 border border-line bg-surface p-7">
            <h3 className="m-0 text-xl font-semibold text-amber">Spend DOGE on</h3>
            <p className="m-0 leading-relaxed text-soft">Special Maze entries · Agent skins · Movement trails · Victory animations · Nameplates</p>
            <p className="m-0 text-sm text-muted">Cosmetics never change how NOVA plays.</p>
          </div>
          <div className="flex flex-col gap-3.5 border border-line bg-surface p-7">
            <h3 className="m-0 text-xl font-semibold text-ok">Earn DOGE from</h3>
            <p className="m-0 leading-relaxed text-soft">Selected achievements · First-time challenge clears · Funded milestones</p>
            <p className="m-0 text-sm text-muted">Paid from a DOGE reserve held on-chain. No minted tokens.</p>
          </div>
        </div>
        <p className="m-0 border border-dashed border-amber px-5 py-4 font-mono text-[13px] text-[#FFD27A]">DogeOS Chikyū testnet · Testnet DOGE has no real-world monetary value.</p>
      </Section>

      <footer className="border-t border-line2">
        <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-4 px-5 py-8 text-sm text-muted sm:px-8">
          <span className="font-pixel text-[11px] text-ink">AFTERMAZE</span>
          <span>Train your agent. Enter the maze. Beat your best.</span>
        </div>
      </footer>
    </div>
  );
}
