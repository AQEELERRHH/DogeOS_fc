import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  type GameState,
  type MatchConfig,
  type MatchResult,
  SPECIAL_MAZES,
  buildConfig,
  dailyConfig,
  replayFrames,
} from "@aftermaze/engine";
import { ArenaCanvas } from "../game/ArenaCanvas";
import { learnInWorker, runInWorker } from "../simClient";
import { type MatchRecord, consumeSpecialEntry, currentPolicy, getSave, recordEndless, recordMatch, specialUsedBy, todayUtc, useSave } from "../store";
import { useWallet } from "../wallet/WalletContext";
import { useChain } from "../wallet/useChain";
import { Eyebrow, MODE_LABEL, Page, Panel, Stat, btnGhost, btnPrimary, pad } from "../components/ui";

const SPEEDS = [
  { label: "1×", ms: 130 },
  { label: "2×", ms: 65 },
  { label: "4×", ms: 30 },
];

interface Run {
  result: MatchResult;
  frames: GameState[];
  replayOf: MatchRecord | null;
  verified: boolean | null;
  endless: { runId: string; floor: number; cleared: number } | null;
}

type Phase =
  | { k: "menu" }
  | { k: "computing"; label: string }
  | { k: "playing" }
  | { k: "learning" }
  | { k: "done"; record: MatchRecord | null; next: (() => void) | null; endlessOver: number | null }
  | { k: "error"; message: string };

export function Arena() {
  const save = useSave();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>({ k: "menu" });
  const [run, setRun] = useState<Run | null>(null);
  const [idx, setIdx] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [trainingLevel, setTrainingLevel] = useState(1);
  const busy = useRef(false);
  const finished = useRef<Run | null>(null);

  const start = useCallback(
    async (config: MatchConfig, opts: { hp?: number; replayOf?: MatchRecord; endless?: Run["endless"]; entryOf?: string } = {}) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const policy = opts.replayOf ? opts.replayOf.policy : currentPolicy();
        if (!policy) throw new Error("No agent policy found.");
        setPhase({ k: "computing", label: opts.replayOf ? "Re-running the match to verify it…" : "NOVA is entering THE GRID…" });
        const result = await runInWorker(config, policy, opts.hp);
        const frames = [...replayFrames(config, result.actions, opts.hp)];
        const verified = opts.replayOf ? result.replayHash === opts.replayOf.replayHash : null;
        if (opts.entryOf) consumeSpecialEntry(opts.entryOf);
        setRun({ result, frames, replayOf: opts.replayOf ?? null, verified, endless: opts.endless ?? null });
        setIdx(0);
        setPaused(false);
        setPhase({ k: "playing" });
      } catch (e) {
        setPhase({ k: "error", message: String(e) });
      } finally {
        busy.current = false;
      }
    },
    [],
  );

  // Replay from history: /arena?replay=<id>
  useEffect(() => {
    const id = params.get("replay");
    if (!id) return;
    const rec = getSave().matches.find((m) => m.id === id);
    setParams({}, { replace: true });
    if (rec) start(rec.config, { replayOf: rec, hp: rec.hp });
  }, [params, setParams, start]);

  // Playback clock.
  useEffect(() => {
    if (phase.k !== "playing" || paused || !run) return;
    if (idx >= run.frames.length - 1) return;
    const t = setTimeout(() => setIdx((i) => Math.min(i + 1, run.frames.length - 1)), SPEEDS[speed].ms);
    return () => clearTimeout(t);
  }, [phase.k, paused, run, idx, speed]);

  // Match finished: learn, record, decide what's next.
  useEffect(() => {
    if (phase.k !== "playing" || !run || idx < run.frames.length - 1 || finished.current === run) return;
    finished.current = run;
    (async () => {
      await new Promise((r) => setTimeout(r, 700));
      if (run.replayOf) {
        setPhase({ k: "done", record: run.replayOf, next: null, endlessOver: null });
        return;
      }
      setPhase({ k: "learning" });
      const s = getSave();
      let learned = null;
      try {
        if (s.policies) learned = await learnInWorker(s.policies, run.result, s.memory, s.analyses);
      } catch {
        learned = null;
      }
      const e = run.endless;
      const record = recordMatch(run.result, learned, e ? { runId: e.runId, floor: e.floor, hp: run.frames[0].agent.hp } : {});
      if (e) {
        const escaped = run.result.status === "escaped";
        const cleared = e.cleared + (escaped ? 1 : 0);
        if (escaped) {
          const hp = run.frames[0].agent.hp - run.result.stats.damageTaken;
          const next = () =>
            start(buildConfig({ mode: "endless", seed: `${e.runId}:floor${e.floor + 1}`, level: 1 + e.floor + 1 }), {
              hp,
              endless: { runId: e.runId, floor: e.floor + 1, cleared },
            });
          setPhase({ k: "done", record, next, endlessOver: null });
        } else {
          recordEndless(cleared);
          setPhase({ k: "done", record, next: null, endlessOver: cleared });
        }
        return;
      }
      setPhase({ k: "done", record, next: null, endlessOver: null });
    })();
  }, [phase.k, run, idx, start]);

  const frame = run?.frames[idx] ?? null;
  const decisions = useMemo(() => {
    if (!run || !frame) return [];
    return run.result.decisions.filter((d) => d.t <= frame.tick).slice(-7);
  }, [run, frame]);

  if (phase.k === "menu" || phase.k === "error" || !run || !frame) {
    return (
      <Page>
        <Menu
          busyLabel={phase.k === "computing" ? phase.label : null}
          error={phase.k === "error" ? phase.message : null}
          trainingLevel={trainingLevel}
          setTrainingLevel={setTrainingLevel}
          onDaily={() => start(dailyConfig(todayUtc()))}
          onSurvival={() => start(buildConfig({ mode: "survival", seed: `survival:${save.survivalLevel}:${Date.now()}`, level: save.survivalLevel }))}
          onTraining={() => start(buildConfig({ mode: "training", seed: `training:${Date.now()}`, level: trainingLevel }))}
          onSpecial={(key, address) =>
            start(buildConfig({ mode: "special", seed: `special:${key}:${Date.now()}`, level: Math.max(4, save.survivalLevel), special: key }), { entryOf: address })
          }
          onEndless={() => {
            const runId = `endless:${Date.now()}`;
            start(buildConfig({ mode: "endless", seed: `${runId}:floor0`, level: 1 }), { endless: { runId, floor: 0, cleared: 0 } });
          }}
        />
      </Page>
    );
  }

  const cfg = run.result.config;
  const a = frame.agent;
  const warnIn = frame.pendingCollapse ? frame.pendingCollapse.at - frame.tick : null;
  const final = idx >= run.frames.length - 1;
  const shownScore = final ? run.result.score.total : frame.score.total;
  const seekers = frame.enemies.filter((e) => e.kind === "seeker").length;
  const sentinels = frame.enemies.length - seekers;
  const title = run.replayOf
    ? `Replay — ${MODE_LABEL[cfg.mode]}`
    : run.endless
      ? `Endless Grid — floor ${run.endless.floor + 1}`
      : `${MODE_LABEL[cfg.mode]}${cfg.mode === "daily" ? ` · ${cfg.seed.replace("daily:", "")}` : ""}`;

  return (
    <Page>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Eyebrow>{title.toUpperCase()} · LEVEL {cfg.level}</Eyebrow>
          <h1 className="m-0 text-2xl font-bold sm:text-3xl">{save.agent?.name} is in THE GRID</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Stat label="Score" value={pad(shownScore)} tone="text-cyan" />
          <Stat label="Tick" value={<>{pad(frame.tick, 3)}<span className="text-xs text-muted">/{cfg.maxTicks}</span></>} />
          <Stat label="Best" value={pad(save.bests[cfg.mode] ?? 0)} tone="text-ok" />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <aside aria-label="Agent status" className="flex min-w-0 flex-[1_1_230px] flex-col gap-4 lg:max-w-[280px]">
          <Panel className="flex flex-col gap-4">
            <Meter label="Integrity" ariaLabel={`${a.hp} of ${cfg.hp} HP`}>
              {Array.from({ length: cfg.hp }, (_, i) => (
                <span key={i} className={`h-3.5 w-7 ${i < a.hp ? "bg-ok" : "bg-line2"}`} />
              ))}
            </Meter>
            <Meter label="Energy crystals" ariaLabel={`${a.collected} of 3 crystals`}>
              {[0, 1, 2].map((i) => (
                <span key={i} className={`size-4 rotate-45 ${i < a.collected ? "bg-ok shadow-[0_0_8px_#3CF28B]" : "border-2 border-[#3A4A66]"}`} />
              ))}
            </Meter>
            <Meter label="Pulse bombs" ariaLabel={`${a.bombs} of ${cfg.bombs} bombs left`}>
              {Array.from({ length: Math.max(cfg.bombs, 1) }, (_, i) => (
                <span key={i} className={`size-[18px] rounded-full ${i < a.bombs ? "bg-cyan shadow-[0_0_8px_#22E4F5]" : "border-2 border-[#3A4A66]"}`} />
              ))}
            </Meter>
          </Panel>
          <Panel className="flex flex-col gap-3 text-sm text-soft">
            <span className="text-xs uppercase tracking-wider text-muted">On the grid</span>
            <span className="flex items-center gap-2.5"><span className="size-3 rotate-45 bg-danger" />Seeker ×{seekers}</span>
            <span className="flex items-center gap-2.5"><span className="size-3 border-[3px] border-amber" />Sentinel ×{sentinels}</span>
            <span className="flex items-center gap-2.5"><span className="size-3 bg-[#2A1F55] shadow-[inset_0_0_0_2px_#9B6BFF]" />Echo Trail ×{frame.trailExpiry.length}</span>
          </Panel>
        </aside>

        <section aria-label="Game" className="order-first flex min-w-0 flex-[1_1_620px] flex-col items-center gap-3 lg:order-none">
          <div
            role="status"
            className={`flex w-full items-center justify-center gap-3 border px-4 py-3 font-pixel text-[10px] ${
              warnIn !== null ? "border-amber bg-[#2A1E04] text-[#FFD27A]" : "border-line2 bg-bg2 text-muted"
            }`}
          >
            <span className={`size-2.5 ${warnIn !== null ? "bg-amber" : "bg-line"}`} aria-hidden="true" />
            {warnIn !== null ? `COLLAPSE WARNING · CLOSES IN ${warnIn}` : frame.status === "running" ? "THE GRID IS STABLE" : frame.status.toUpperCase()}
          </div>
          <div className="w-full border-2 border-line bg-surface p-2 shadow-[0_0_0_6px_#0A0F1B,0_0_60px_rgba(34,228,245,0.08)] sm:p-3">
            <ArenaCanvas frames={run.frames} index={idx} tickMs={SPEEDS[speed].ms} label={`THE GRID at tick ${frame.tick}`} />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button type="button" aria-label={paused ? "Play" : "Pause"} onClick={() => setPaused((p) => !p)} disabled={final} className="grid size-11 place-items-center border border-line bg-surface text-ink">
              {paused ? (
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2l10 6-10 6z" fill="currentColor" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2v12M12 2v12" stroke="currentColor" strokeWidth="2.5" /></svg>
              )}
            </button>
            {SPEEDS.map((s, i) => (
              <button key={s.label} type="button" onClick={() => setSpeed(i)} aria-pressed={speed === i} className={`min-h-11 px-4 font-pixel text-[10px] ${speed === i ? "bg-cyan text-bg" : "border border-line bg-surface text-ink"}`}>
                {s.label}
              </button>
            ))}
            <button type="button" onClick={() => setIdx(run.frames.length - 1)} disabled={final} className={btnGhost}>Skip to end</button>
            <span className="pl-1 text-[13px] text-muted">Playback only. NOVA decides every move.</span>
          </div>
        </section>

        <aside aria-label="Agent reasoning" className="flex min-w-0 flex-[1_1_280px] flex-col gap-4 lg:max-w-[340px]">
          <div className="flex flex-col border border-line bg-[#05080F]">
            <div className="flex items-center justify-between border-b border-line2 px-4 py-3">
              <span className="font-pixel text-[10px] text-cyan">{(save.agent?.name ?? "NOVA").toUpperCase()}://THINKING</span>
              <span className={`size-2 ${final ? "bg-muted" : "bg-ok shadow-[0_0_8px_#3CF28B]"}`} aria-hidden="true" />
            </div>
            <ol className="m-0 flex min-h-[320px] list-none flex-col gap-3 p-4 font-mono text-xs leading-relaxed" aria-live="off">
              {decisions.map((d, i) => (
                <li key={`${d.t}-${i}`} className={i === decisions.length - 1 ? "text-ink" : "text-muted"}>
                  <span className="text-muted">T+{pad(d.t, 3)}</span> <span className="text-cyan">{d.action}</span>
                  <br />
                  {d.reason}
                </li>
              ))}
            </ol>
          </div>
          {run.verified !== null && (
            <Panel className={`text-sm ${run.verified ? "text-ok" : "text-danger"}`}>
              {run.verified ? "Verified: re-running this match produced the exact same replay hash." : "Warning: this replay did not reproduce the recorded result."}
            </Panel>
          )}
          <Outcome phase={phase} run={run} final={final} onMenu={() => { setRun(null); setPhase({ k: "menu" }); }} onDebrief={(id) => navigate(`/history/${id}`)} />
        </aside>
      </div>
    </Page>
  );
}

function Meter({ label, ariaLabel, children }: { label: string; ariaLabel: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wider text-muted">{label}</span>
      <div className="flex items-center gap-2.5" role="img" aria-label={ariaLabel}>{children}</div>
    </div>
  );
}

function Outcome({ phase, run, final, onMenu, onDebrief }: { phase: Phase; run: Run; final: boolean; onMenu: () => void; onDebrief: (id: string) => void }) {
  if (!final) return null;
  const r = run.result;
  const good = r.status === "escaped";
  const head = good ? "ESCAPED" : r.status === "timeout" ? "TIME UP" : "DESTROYED";
  return (
    <Panel className={`flex flex-col gap-3 ${good ? "border-ok" : "border-danger"}`}>
      <span className={`font-pixel text-sm ${good ? "text-ok" : "text-danger"}`}>{head}</span>
      <span className="text-[15px] text-soft">
        {r.stats.crystals}/3 crystals · {r.stats.damageTaken} hit{r.stats.damageTaken === 1 ? "" : "s"} · {r.score.total} points
      </span>
      {phase.k === "learning" && <span className="font-mono text-sm text-cyan">Replaying recent mazes with strategy adjustments…</span>}
      {phase.k === "done" && phase.record?.learning && !run.replayOf && <p className="m-0 text-sm leading-relaxed">{phase.record.learning.explanation}</p>}
      {phase.k === "done" && phase.endlessOver !== null && <span className="font-pixel text-[11px] text-amber">RUN OVER · {phase.endlessOver} FLOOR{phase.endlessOver === 1 ? "" : "S"} CLEARED</span>}
      {phase.k === "done" && (
        <div className="flex flex-wrap gap-2.5">
          {phase.next ? (
            <button type="button" className={btnPrimary} onClick={phase.next}>NEXT FLOOR</button>
          ) : (
            <button type="button" className={btnPrimary} onClick={onMenu}>RUN AGAIN</button>
          )}
          {phase.record && <button type="button" className={btnGhost} onClick={() => onDebrief(phase.record!.id)}>Debrief</button>}
          <Link to="/workshop" className={btnGhost}>Coach</Link>
        </div>
      )}
    </Panel>
  );
}

interface MenuProps {
  busyLabel: string | null;
  error: string | null;
  trainingLevel: number;
  setTrainingLevel: (n: number) => void;
  onDaily: () => void;
  onSurvival: () => void;
  onTraining: () => void;
  onEndless: () => void;
  onSpecial: (key: string, address: string) => void;
}

function Menu(p: MenuProps) {
  const save = useSave();
  const today = todayUtc();
  const dailyDone = save.matches.find((m) => m.mode === "daily" && m.config.seed === `daily:${today}`);
  const recent = save.matches.slice(0, 5);
  const disabled = !!p.busyLabel;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Eyebrow>ARENA</Eyebrow>
          <h1 className="m-0 text-3xl font-bold">Choose a challenge for {save.agent?.name}</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Stat label="Matches" value={save.matches.length} />
          <Stat label="Survival level" value={save.survivalLevel} tone="text-cyan" />
          <Stat label="Endless best" value={`${save.endlessBestFloors} fl`} tone="text-ok" />
        </div>
      </div>
      {p.busyLabel && <Panel className="font-pixel text-[11px] text-cyan">{p.busyLabel.toUpperCase()}</Panel>}
      {p.error && <Panel className="border-danger text-danger">Something went wrong: {p.error}</Panel>}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
        <ModeCard tag="FREE" title="Daily Maze" body={`Today's fixed maze (${today}). Same layout for every player.${dailyDone ? ` Best today: ${save.matches.filter((m) => m.config.seed === `daily:${today}`).reduce((b, m) => Math.max(b, m.score.total), 0)}.` : ""}`} action="ENTER" onClick={p.onDaily} disabled={disabled} />
        <ModeCard tag="FREE" title={`Survival · level ${save.survivalLevel}`} body="Each escape unlocks a harder maze. Fail and you retry the same level on a new maze." action="ENTER" onClick={p.onSurvival} disabled={disabled} />
        <ModeCard tag="FREE" title="Endless Grid" body="Floor after floor, getting harder. HP carries over. One failure ends the run." action="START RUN" onClick={p.onEndless} disabled={disabled} />
        <div className="flex flex-col gap-3 border border-line p-6">
          <span className="font-pixel text-[11px] text-ok">FREE</span>
          <h3 className="m-0 text-xl font-semibold">Training · level {p.trainingLevel}</h3>
          <p className="m-0 flex-grow text-[15px] leading-normal text-soft">Pick any difficulty and experiment. NOVA still learns from it.</p>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Lower level" className="size-11 border border-line text-lg" onClick={() => p.setTrainingLevel(Math.max(1, p.trainingLevel - 1))}>−</button>
            <span className="w-10 text-center font-pixel text-sm">{p.trainingLevel}</span>
            <button type="button" aria-label="Raise level" className="size-11 border border-line text-lg" onClick={() => p.setTrainingLevel(Math.min(15, p.trainingLevel + 1))}>+</button>
            <button type="button" className={`${btnPrimary} ml-auto`} onClick={p.onTraining} disabled={disabled}>TRAIN</button>
          </div>
        </div>
      </div>

      <SpecialMazes disabled={disabled} onSpecial={p.onSpecial} />

      {recent.length > 0 && (
        <Panel className="flex flex-col gap-3">
          <span className="text-xs uppercase tracking-wider text-muted">Recent matches</span>
          {recent.map((m) => (
            <Link key={m.id} to={`/history/${m.id}`} className="flex flex-wrap justify-between gap-2 border-b border-line2 pb-2 text-[15px] text-ink no-underline hover:text-cyan">
              <span>{MODE_LABEL[m.mode]} · L{m.config.level}</span>
              <span className={m.status === "escaped" ? "text-ok" : "text-danger"}>{m.status}</span>
              <span className="font-mono">{m.score.total}</span>
            </Link>
          ))}
        </Panel>
      )}
    </>
  );
}

function SpecialMazes({ disabled, onSpecial }: { disabled: boolean; onSpecial: (key: string, address: string) => void }) {
  const wallet = useWallet();
  const chain = useChain();
  useSave(); // re-render when entries are used
  const used = wallet.address ? specialUsedBy(wallet.address) : 0;
  const available = Math.max(0, Number(chain.specialEntries) - used);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Eyebrow className="text-amber">SPECIAL MAZES · DOGE</Eyebrow>
        <span className="text-sm text-muted">
          {!wallet.connected ? (
            "Connect a wallet to use Special Maze entries."
          ) : (
            <>
              <span className="text-amber">{available} entr{available === 1 ? "y" : "ies"} available</span> · <Link to="/shop">Buy entries</Link>
            </>
          )}
        </span>
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {Object.values(SPECIAL_MAZES).map((m) => (
          <div key={m.key} className="flex flex-col gap-2 border border-line bg-surface p-4">
            <span className="font-semibold">{m.name}</span>
            <span className="flex-grow text-sm text-soft">{m.description}</span>
            <button
              type="button"
              className="mt-1 inline-flex min-h-11 items-center justify-center self-start bg-amber px-4 font-pixel text-[10px] text-bg"
              disabled={disabled || !wallet.address || available < 1}
              onClick={() => wallet.address && onSpecial(m.key, wallet.address)}
            >
              USE 1 ENTRY
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ModeCard({ tag, title, body, action, onClick, disabled }: { tag: string; title: string; body: string; action: string; onClick: () => void; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-3 border border-line p-6">
      <span className="font-pixel text-[11px] text-ok">{tag}</span>
      <h3 className="m-0 text-xl font-semibold">{title}</h3>
      <p className="m-0 flex-grow text-[15px] leading-normal text-soft">{body}</p>
      <button type="button" className={`${btnPrimary} self-start`} onClick={onClick} disabled={disabled}>{action}</button>
    </div>
  );
}
