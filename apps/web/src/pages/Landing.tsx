import { Suspense, lazy, useEffect } from "react";
import { Link } from "react-router-dom";
import { CLUBS, FORMATIONS, STYLE_LABEL, type FormationKey } from "@dogefc/engine";
import { Eyebrow, SiteHeader, btnPrimary } from "../components/ui";
import { FormationDiagram } from "../football/FormationDiagram";

const LiveDemo = lazy(() => import("../football/LiveDemo"));

function Section({ id, children, alt = false }: { id?: string; children: React.ReactNode; alt?: boolean }) {
  return (
    <section id={id} className={`border-t border-line2 ${alt ? "bg-bg2" : ""}`}>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-10 px-5 py-20 sm:px-8">{children}</div>
    </section>
  );
}

export function Landing() {
  // Warm up the match screen so "Play a match" opens instantly.
  useEffect(() => {
    void import("./Play");
  }, []);
  return (
    <div>
      <SiteHeader />

      <section className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-14 px-5 pb-24 pt-12 sm:px-8">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-7">
          <div className="inline-flex items-center gap-2.5 self-start border border-line px-3 py-2 font-mono text-[13px] text-soft">
            <span className="size-2 bg-ok shadow-[0_0_8px_#3CF28B]" aria-hidden="true" />
            Built for DogeOS
          </div>
          <h1 className="m-0 font-pixel text-[28px] leading-[1.4] tracking-wide sm:text-[40px]">
            YOU MANAGE.
            <br />
            <span className="text-cyan">THEY PLAY.</span>
          </h1>
          <p className="m-0 max-w-[560px] text-xl leading-relaxed text-soft">
            Set the tactics for a squad of five AI footballers. Pick the formation, shout from the touchline, and watch your players carry out the plan on their own.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link to="/play" className={`${btnPrimary} px-6 py-4 text-[13px]`}>PLAY A MATCH</Link>
            <a href="#how" className="inline-flex min-h-11 items-center border-2 border-violet px-5 py-4 font-pixel text-[13px] text-ink no-underline">HOW IT WORKS</a>
          </div>
          <p className="m-0 font-mono text-[13px] text-muted">No joystick. Your players decide every touch. You decide how they play.</p>
        </div>
        <div className="flex min-w-0 flex-[1_1_520px] justify-center">
          <Suspense fallback={<div className="aspect-[5/3] w-full max-w-[680px] border-2 border-line bg-surface" />}>
            <LiveDemo />
          </Suspense>
        </div>
      </section>

      <Section id="how" alt>
        <div className="flex flex-col gap-3">
          <Eyebrow>01 / HOW IT WORKS</Eyebrow>
          <h2 className="m-0 text-4xl font-bold">Five players. One plan. Yours.</h2>
        </div>
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {[
            ["Pick a rival", "Four clubs, each with an AI manager who plays a different way: park the bus, high press, possession or counter-attack."],
            ["Set your plan", "Choose a formation, then your mentality, pressing, passing style and width. Every choice changes how your players behave."],
            ["Shout from the touchline", "Losing? Change the formation or go all-out attack mid-match. The half-time break gives you time to rethink."],
            ["Read the game", "Live commentary and stats show what's working. Your rival's manager reacts to you, so you have to react back."],
            ["Build your club", "Name your club and players, pick your kit, give each player a style like poacher or sweeper keeper, and spend the points you earn on training."],
          ].map(([t, b], i) => (
            <div key={t} className="flex flex-col gap-3.5 border border-line bg-surface p-7">
              <span className="font-pixel text-lg text-cyan">{i + 1}</span>
              <h3 className="m-0 text-[22px] font-semibold">{t}</h3>
              <p className="m-0 leading-relaxed text-soft">{b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="flex flex-col gap-3">
          <Eyebrow>02 / THE AI</Eyebrow>
          <h2 className="m-0 text-4xl font-bold">Every player thinks for themselves.</h2>
        </div>
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
          <div className="flex flex-col gap-3 border border-line bg-surface p-7">
            <h3 className="m-0 text-xl font-semibold text-cyan">Autonomous players</h3>
            <p className="m-0 leading-relaxed text-soft">
              Ten times a second, each player weighs passing, shooting, dribbling, pressing and covering. Their choices depend on their skills, where everyone is, and the plan you set.
            </p>
          </div>
          <div className="flex flex-col gap-3 border border-line bg-surface p-7">
            <h3 className="m-0 text-xl font-semibold text-amber">Rival managers that adapt</h3>
            <p className="m-0 leading-relaxed text-soft">
              The opposing manager reads the score, the clock and your tactics. Go all-out attack and they add a defender. Fall behind and they press harder.
            </p>
          </div>
          <div className="flex flex-col gap-3 border border-line bg-surface p-7">
            <h3 className="m-0 text-xl font-semibold text-ok">Fair and replayable</h3>
            <p className="m-0 leading-relaxed text-soft">
              The match engine is deterministic: the same starting point and the same decisions always produce the same match, so results can be checked.
            </p>
          </div>
        </div>
      </Section>

      <Section alt>
        <div className="flex flex-col gap-3">
          <Eyebrow>03 / FORMATIONS</Eyebrow>
          <h2 className="m-0 text-4xl font-bold">No formation wins everything.</h2>
          <p className="m-0 max-w-3xl text-lg text-soft">Each shape trades attack for defence, and works best when your players fit their roles.</p>
        </div>
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          {(Object.keys(FORMATIONS) as FormationKey[]).map((f) => (
            <div key={f} className="flex flex-col gap-3 border border-line bg-surface p-4">
              <FormationDiagram f={f} active={false} />
              <h3 className="m-0 font-mono text-base text-cyan">{FORMATIONS[f].name}</h3>
              <p className="m-0 text-sm leading-normal text-soft">{FORMATIONS[f].description}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-6 font-mono text-[13px] text-soft">
          <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-cyan" />Defender</span>
          <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-violet" />Midfielder</span>
          <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-amber" />Forward</span>
        </div>
      </Section>

      <Section>
        <div className="flex flex-col gap-3">
          <Eyebrow>04 / THE LEAGUE</Eyebrow>
          <h2 className="m-0 text-4xl font-bold">Know your rivals.</h2>
        </div>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {CLUBS.map((c) => (
            <div key={c.id} className="flex items-center gap-4 border border-line bg-surface p-5">
              <span className="size-10 shrink-0 border-2" style={{ background: c.color, borderColor: c.trim }} aria-hidden="true" />
              <div className="flex flex-col gap-0.5">
                <span className="text-lg font-semibold">{c.name}</span>
                <span className="text-sm text-soft">{c.id === "doge-fc" ? "Demo squad" : STYLE_LABEL[c.style]}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section alt>
        <div className="flex flex-col gap-3">
          <Eyebrow>05 / COMING NEXT</Eyebrow>
          <h2 className="m-0 text-4xl font-bold">From friendlies to a full club.</h2>
        </div>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
          {[
            ["A league season", "Play the AI clubs home and away and climb the table."],
            ["Manager vs manager", "Your trained club against other players' clubs. Nobody needs to be online at the same time."],
            ["DOGE on DogeOS", "Kits and cosmetics paid in DOGE, and prizes from an on-chain reserve. Never pay-to-win."],
          ].map(([t, b]) => (
            <div key={t} className="flex flex-col gap-2.5 border border-line p-6">
              <span className="font-pixel text-[10px] text-amber">SOON</span>
              <h3 className="m-0 text-lg font-semibold">{t}</h3>
              <p className="m-0 text-[15px] leading-normal text-soft">{b}</p>
            </div>
          ))}
        </div>
        <p className="m-0 border border-dashed border-amber px-5 py-4 font-mono text-[13px] text-[#FFD27A]">Built on DogeOS Chikyū testnet · All clubs and players are fictional.</p>
      </Section>

      <footer className="border-t border-line2">
        <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-4 px-5 py-8 text-sm text-muted sm:px-8">
          <span className="font-pixel text-[11px] text-ink">DOGE FC</span>
          <span>You manage. They play.</span>
        </div>
      </footer>
    </div>
  );
}
