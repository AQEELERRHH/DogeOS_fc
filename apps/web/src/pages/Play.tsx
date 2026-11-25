import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CLUBS,
  DEFAULT_TACTICS,
  FORMATIONS,
  MENTALITY_LABEL,
  PASSING_LABEL,
  PRESSING_LABEL,
  STYLE_LABEL,
  WIDTH_LABEL,
  commentate,
  applyTactics,
  createMatch,
  matchMinute,
  step,
  styleLabel,
  type ClubDef,
  type FormationKey,
  type MatchState,
  type Tactics,
  type MatchInput,
  type TouchlineCall,
  type V2,
} from "@dogefc/engine";
import { PitchCanvas } from "../football/PitchCanvas";
import { FormationDiagram } from "../football/FormationDiagram";
import type { FrameSource } from "../football/PitchScene";
import { Link } from "react-router-dom";
import { Eyebrow, Panel, SiteHeader, btnGhost, btnPrimary } from "../components/ui";
import { toClubDef, useClub } from "../club/store";
import { formatEther } from "viem";
import { useWallet } from "../wallet/WalletContext";
import { explainError, writeAndWait } from "../wallet/tx";
import { TICKETS_ADDRESS, matchFromReceipt, readFee, rivalId, ticketsAbi } from "../chain/tickets";
import { FAUCET, txUrl } from "../chain/config";
import { useCommentaryVoice } from "../football/voice";
import { TouchPad, TouchlineCalls, ZERO, useKeyboardControl } from "../football/controls";

type WithoutTick<T> = T extends unknown ? Omit<T, "t"> : never;

const CONTROL_KEY = "dogefc.control";
function savedControl(): number | null {
  try {
    const v = localStorage.getItem(CONTROL_KEY);
    return v === null || v === "off" ? null : Number(v);
  } catch {
    return null;
  }
}

const DEMO_CLUB = CLUBS[0];
const RIVALS = CLUBS.slice(1);
const TICK_MS = 100;
const SPEEDS = [1, 2, 4];

type Screen = { k: "setup" } | { k: "live"; key: string } | { k: "done"; key: string };

export type KickOffStatus = { k: "idle" } | { k: "connect" } | { k: "confirm" } | { k: "mining"; hash: string } | { k: "error"; msg: string };
interface OnChainMatch {
  matchId: bigint;
  hash: string;
}

export function Play() {
  const { club, recordResult } = useClub();
  const myClub = useMemo(() => (club ? toClubDef(club) : DEMO_CLUB), [club]);
  const [earned, setEarned] = useState<number | null>(null);
  const wallet = useWallet();
  const [fee, setFee] = useState<bigint | null>(null);
  const [status, setStatus] = useState<KickOffStatus>({ k: "idle" });
  const [onChain, setOnChain] = useState<OnChainMatch | null>(null);

  useEffect(() => {
    readFee()
      .then(setFee)
      .catch(() => setFee(null));
  }, []);

  // Once the wallet connects after we asked, clear the prompt.
  useEffect(() => {
    if (wallet.connected && status.k === "connect") setStatus({ k: "idle" });
  }, [wallet.connected, status.k]);
  const [screen, setScreen] = useState<Screen>({ k: "setup" });
  const [rival, setRival] = useState<ClubDef>(RIVALS[0]);
  const [tactics, setTactics] = useState<Tactics>({ ...DEFAULT_TACTICS });
  const [draft, setDraft] = useState<Tactics>({ ...DEFAULT_TACTICS });
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [, setUi] = useState(0);
  const sim = useRef<{ state: MatchState; prev: MatchState | null; acc: number; last: number; inputs: MatchInput[]; htShown: boolean; recorded?: boolean } | null>(null);
  // Player-manager mode (optional): which of your outfield players you steer, if any.
  const [controlPick, setControlPickState] = useState<number | null>(savedControl);
  const setControlPick = (v: number | null) => {
    setControlPickState(v);
    try {
      localStorage.setItem(CONTROL_KEY, v === null ? "off" : String(v));
    } catch {
      // ignore
    }
  };
  const [controlling, setControlling] = useState(false);
  const lastMove = useRef<V2>(ZERO);
  const coarse = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches, []);
  const clubRef = useRef(club);
  clubRef.current = club;
  const pausedRef = useRef(paused);
  const speedRef = useRef(speed);
  pausedRef.current = paused;
  speedRef.current = speed;

  const busy = status.k === "confirm" || status.k === "mining";

  // Every match is paid for on-chain. The kick-off transaction fixes the seed the match is played from.
  const kickOff = async () => {
    if (busy) return;
    // Local development only (stripped from production builds): play without paying.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has("devmatch")) {
      startMatch(`dev:${Date.now()}`);
      return;
    }
    if (!TICKETS_ADDRESS) {
      setStatus({ k: "error", msg: "The match contract isn't available right now. Try again in a moment." });
      return;
    }
    // The fee is read when the page opens. If that read failed (a network blip), try again now.
    let price = fee;
    if (price === null) {
      try {
        price = await readFee();
        setFee(price);
      } catch {
        price = null;
      }
      if (price === null) {
        setStatus({ k: "error", msg: "Couldn't reach DogeOS to read the match fee. Check your connection and try again." });
        return;
      }
    }
    if (!wallet.connected || !wallet.address || !wallet.provider) {
      setStatus({ k: "connect" });
      wallet.openModal();
      return;
    }
    try {
      setStatus({ k: "confirm" });
      const { hash, receipt } = await writeAndWait(
        wallet.provider,
        wallet.address,
        { address: TICKETS_ADDRESS, abi: ticketsAbi, functionName: "kickOff", args: [rivalId(rival.id)], value: price },
        (h) => setStatus({ k: "mining", hash: h }),
      );
      const m = matchFromReceipt(receipt);
      setOnChain({ matchId: m.matchId, hash });
      setStatus({ k: "idle" });
      startMatch(`match:${m.matchId}:${m.seed}`);
    } catch (e) {
      setStatus({ k: "error", msg: explainError(e) });
    }
  };

  const startMatch = (seed: string) => {
    const state = createMatch(
      { seed, home: myClub, away: avoidClash(myClub, rival), halfTicks: 900, aiControls: [false, true] },
      [tactics, null],
    );
    const pick = controlPick !== null && myClub.squad[controlPick]?.role !== "GK" ? controlPick : null;
    // Inputs at the current tick are applied by the engine on its next step, and kept for replays.
    const inputs: MatchInput[] = pick !== null ? [{ t: 0, team: 0, player: pick, move: ZERO }] : [];
    sim.current = { state, prev: null, acc: 0, last: performance.now(), inputs, htShown: false };
    lastMove.current = ZERO;
    setControlling(pick !== null);
    if (pick !== null) setSpeed(0); // easier to play at normal speed
    setDraft({ ...tactics });
    setEarned(null);
    setPaused(false);
    setScreen({ k: "live", key: state.config.seed });
  };

  // Game loop: fixed 10 Hz simulation, rendered smoothly in between.
  useEffect(() => {
    if (screen.k !== "live") return;
    let raf = 0;
    const loop = (now: number) => {
      const s = sim.current;
      if (s) {
        const dt = Math.min(250, now - s.last);
        s.last = now;
        if (!pausedRef.current && s.state.phase !== "fulltime") {
          s.acc += dt * SPEEDS[speedRef.current];
          while (s.acc >= TICK_MS && (s.state.phase as string) !== "fulltime") {
            s.prev = snapshot(s.state);
            step(s.state, s.inputs);
            s.acc -= TICK_MS;
            if (s.state.phase === "halftime" && !s.htShown) {
              s.htShown = true;
              setPaused(true);
              pausedRef.current = true;
              s.acc = 0;
              break;
            }
          }
          if ((s.state.phase as string) === "fulltime" && !s.recorded) {
            s.recorded = true;
            if (clubRef.current) setEarned(recordResult(s.state.config.away.name, s.state.score[0], s.state.score[1]));
            setScreen((x) => (x.k === "live" ? { k: "done", key: x.key } : x));
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ui = setInterval(() => setUi((n) => n + 1), 200);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(ui);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.k]);

  const source = useCallback((): FrameSource => {
    const s = sim.current;
    return { prev: s?.prev ?? null, cur: s?.state ?? null, alpha: s ? Math.min(1, s.acc / TICK_MS) : 1 };
  }, []);

  const applyDraft = () => {
    const s = sim.current;
    if (!s) return;
    // Applied now, and recorded so the match can be replayed exactly.
    applyTactics(s.state, 0, { ...draft }, "Manager's instruction", false);
    s.inputs.push({ t: s.state.tick, team: 0, tactics: { ...draft } });
    setTactics({ ...draft });
  };

  const controlIdx = controlPick !== null && myClub.squad[controlPick]?.role !== "GK" ? controlPick : null;
  const pushInput = (inp: WithoutTick<MatchInput>) => {
    const s = sim.current;
    if (!s || s.state.phase === "fulltime") return;
    s.inputs.push({ ...inp, t: s.state.tick } as MatchInput);
  };
  const onMove = (m: V2) => {
    if (controlIdx === null) return;
    lastMove.current = m;
    pushInput({ team: 0, player: controlIdx, move: m });
  };
  const onAction = (a: "pass" | "shoot") => {
    if (controlIdx === null) return;
    pushInput({ team: 0, player: controlIdx, move: lastMove.current, action: a });
  };
  const toggleControl = () => {
    if (controlIdx === null) return;
    if (controlling) pushInput({ team: 0, player: -1, move: ZERO });
    else pushInput({ team: 0, player: controlIdx, move: ZERO });
    lastMove.current = ZERO;
    setControlling(!controlling);
  };
  const shout = (c: TouchlineCall) => pushInput({ team: 0, call: c });
  useKeyboardControl(screen.k === "live" && controlling && !paused, onMove, onAction);

  const voice = useCommentaryVoice(screen.k === "setup" ? "setup" : screen.key, paused || screen.k !== "live");
  useEffect(() => {
    const s = sim.current;
    if (s && screen.k === "live") voice.feed(commentate(s.state, s.state.events));
  });

  if (screen.k === "setup") {
    return <Setup club={myClub} hasClub={!!club} rival={rival} setRival={setRival} tactics={tactics} setTactics={setTactics} onKickOff={kickOff} fee={fee} status={status} controlPick={controlPick} setControlPick={setControlPick} />;
  }

  const s = sim.current!.state;
  const lines = commentate(s, s.events).slice(-9).reverse();
  const st = s.stats;
  const possTotal = st[0].possessionTicks + st[1].possessionTicks || 1;
  const dirty = JSON.stringify(draft) !== JSON.stringify(s.tactics[0]);
  const halftime = s.phase === "halftime" && paused;
  const done = screen.k === "done";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto flex max-w-[1400px] flex-col gap-5 px-5 pb-10 pt-5 sm:px-8">
        <Scoreboard s={s} />

        <div className="flex flex-wrap items-start gap-5">
          <section className="flex min-w-0 flex-[3_1_640px] flex-col gap-3">
            <div className="relative border-2 border-line bg-surface p-2 shadow-[0_0_0_6px_#0A0F1B]">
              <PitchCanvas source={source} matchKey={screen.key} />
              {(halftime || done) && (
                <div className="absolute inset-0 grid place-items-center bg-[#070B14cc] p-4">
                  <div className="flex max-w-md flex-col items-center gap-4 text-center">
                    <span className="font-pixel text-lg text-cyan">{done ? "FULL-TIME" : "HALF-TIME"}</span>
                    <span className="font-pixel text-3xl">{s.score[0]} – {s.score[1]}</span>
                    <p className="m-0 text-soft">
                      {done
                        ? s.score[0] > s.score[1]
                          ? "Your tactics won it. Try a tougher rival or a different formation."
                          : s.score[0] < s.score[1]
                            ? `${rival.name} had the answers today. Change the plan and go again.`
                            : "Honours even."
                        : "Change your formation or tactics on the right, then start the second half."}
                    </p>
                    {done && <KickOffNote status={status} />}
                    {done && earned !== null && (
                      <p className="m-0 font-pixel text-[11px] text-amber">+{earned} TRAINING POINT{earned === 1 ? "" : "S"}</p>
                    )}
                    {done && !club && (
                      <p className="m-0 text-sm text-soft">
                        <Link to="/club">Create your own club</Link> to earn training points and keep your record.
                      </p>
                    )}
                    {done ? (
                      <div className="flex flex-wrap justify-center gap-3">
                        <button type="button" className={btnPrimary} onClick={kickOff} disabled={busy}>
                          {busy ? "KICKING OFF…" : `REMATCH · ${feeLabel(fee)}`}
                        </button>
                        <button type="button" className={btnGhost} onClick={() => setScreen({ k: "setup" })}>New match</button>
                        {club && <Link to="/club" className={btnGhost}>Train players</Link>}
                      </div>
                    ) : (
                      <button type="button" className={btnPrimary} onClick={() => setPaused(false)}>START SECOND HALF</button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" className="grid size-11 place-items-center border border-line bg-surface" aria-label={paused ? "Play" : "Pause"} onClick={() => setPaused((p) => !p)} disabled={done || halftime}>
                {paused ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2l10 6-10 6z" fill="currentColor" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2v12M12 2v12" stroke="currentColor" strokeWidth="2.5" /></svg>
                )}
              </button>
              {SPEEDS.map((x, i) => (
                <button key={x} type="button" aria-pressed={speed === i} onClick={() => setSpeed(i)} className={`min-h-11 px-4 font-pixel text-[10px] ${speed === i ? "bg-cyan text-bg" : "border border-line bg-surface"}`}>
                  {x}×
                </button>
              ))}
              {voice.supported && (
                <button type="button" aria-pressed={voice.on} onClick={voice.toggle} className={`flex min-h-11 items-center gap-2 px-3 text-[13px] ${voice.on ? "bg-amber font-semibold text-bg" : "border border-line bg-surface text-soft"}`}>
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
                    {voice.on ? <path d="M11 5.5a3.5 3.5 0 010 5M12.8 3.5a6.3 6.3 0 010 9" stroke="currentColor" strokeWidth="1.5" fill="none" /> : <path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" strokeWidth="1.5" />}
                  </svg>
                  {voice.on ? "Commentary on" : "Voice off"}
                </button>
              )}
              {onChain && (
                <a href={txUrl(onChain.hash)} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted hover:text-cyan">
                  Match #{onChain.matchId.toString()} on-chain ↗
                </a>
              )}
            </div>
            {controlIdx !== null && !done && (
              <Panel className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-pixel text-[10px] text-cyan">
                    PLAYER-MANAGER · #{myClub.squad[controlIdx].number} {myClub.squad[controlIdx].name}
                  </span>
                  <button type="button" className={btnGhost} onClick={toggleControl}>
                    {controlling ? "Let the AI play him" : "Take control"}
                  </button>
                </div>
                {controlling ? (
                  coarse ? (
                    <TouchPad onMove={onMove} onAction={onAction} />
                  ) : (
                    <p className="m-0 text-sm text-soft">
                      Move with <Kbd>W</Kbd><Kbd>A</Kbd><Kbd>S</Kbd><Kbd>D</Kbd> or the arrow keys. <Kbd>Space</Kbd> passes where you're heading, <Kbd>Enter</Kbd> shoots. Let go of the keys and the AI positions him off the ball.
                    </p>
                  )
                ) : (
                  <p className="m-0 text-sm text-muted">The AI is playing him. Take control again whenever you like.</p>
                )}
              </Panel>
            )}
            <Stats s={s} possTotal={possTotal} />
          </section>

          <aside className="flex min-w-0 flex-[1_1_330px] flex-col gap-4">
            <Panel className="p-4 sm:p-5">
              <TouchlineCalls s={s} disabled={done || s.phase === "halftime"} onCall={shout} />
            </Panel>
            <Panel className="flex flex-col gap-3 p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-pixel text-[10px] text-cyan">TACTICS</span>
                <span className="text-xs text-muted">{dirty ? "Not applied yet" : "Current plan"}</span>
              </div>
              <TacticsEditor value={draft} onChange={setDraft} compact />
              <button type="button" className={btnPrimary} disabled={!dirty || done} onClick={applyDraft}>
                SHOUT INSTRUCTIONS
              </button>
            </Panel>
            <div className="flex flex-col border border-line bg-[#05080F]">
              <div className="border-b border-line2 px-4 py-3 font-pixel text-[10px] text-cyan">COMMENTARY</div>
              <ol className="m-0 flex min-h-[260px] list-none flex-col gap-3 p-4 text-sm leading-snug" aria-live="polite">
                {lines.map((l, i) => (
                  <li key={`${l.t}-${i}`} className={l.tone === "goal" ? "font-semibold text-ok" : l.tone === "tactic" ? "text-amber" : l.tone === "whistle" ? "text-cyan" : i === 0 ? "text-ink" : "text-soft"}>
                    <span className="font-mono text-xs text-muted">{l.minute}'</span> {l.text}
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="mx-0.5 inline-block min-w-6 border border-line bg-[#0A1122] px-1.5 py-0.5 text-center font-mono text-xs text-ink">{children}</kbd>;
}

function snapshot(s: MatchState): MatchState {
  return {
    tick: s.tick,
    players: s.players.map((p) => ({ pos: { ...p.pos } })),
    ball: { pos: { ...s.ball.pos } },
  } as unknown as MatchState;
}

function Scoreboard({ s }: { s: MatchState }) {
  const m = matchMinute(s);
  const half = s.tick < s.config.halfTicks ? "1ST HALF" : s.phase === "fulltime" ? "FULL-TIME" : s.phase === "halftime" ? "HALF-TIME" : "2ND HALF";
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 border border-line bg-surface px-4 py-3 sm:gap-8">
      <ClubBadge club={s.config.home} align="right" />
      <div className="flex flex-col items-center gap-1">
        <span className="font-pixel text-3xl tracking-widest">{s.score[0]} – {s.score[1]}</span>
        <span className="font-mono text-xs text-muted">{half} · {String(m).padStart(2, "0")}:00</span>
      </div>
      <ClubBadge club={s.config.away} align="left" />
    </div>
  );
}

function ClubBadge({ club, align }: { club: ClubDef; align: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span className="size-7 border-2" style={{ background: club.color, borderColor: club.trim }} aria-hidden="true" />
      <div className="flex flex-col">
        <span className="text-lg font-semibold">{club.name}</span>
        <span className="text-xs text-muted">{STYLE_LABEL[club.style]}</span>
      </div>
    </div>
  );
}

function Stats({ s, possTotal }: { s: MatchState; possTotal: number }) {
  const [a, b] = s.stats;
  const rows: [string, number | string, number | string][] = [
    ["Possession", `${Math.round((a.possessionTicks / possTotal) * 100)}%`, `${Math.round((b.possessionTicks / possTotal) * 100)}%`],
    ["Shots (on target)", `${a.shots} (${a.onTarget})`, `${b.shots} (${b.onTarget})`],
    ["Passes completed", `${a.passesCompleted}/${a.passes}`, `${b.passesCompleted}/${b.passes}`],
    ["Tackles won", a.tackles, b.tackles],
    ["Interceptions & blocks", a.interceptions, b.interceptions],
    ["Saves", a.saves, b.saves],
  ];
  return (
    <Panel className="grid grid-cols-[1fr_auto_1fr] gap-x-4 gap-y-2 p-4 text-sm sm:p-5">
      {rows.map(([label, x, y]) => (
        <div key={label} className="contents">
          <span className="text-right font-mono">{x}</span>
          <span className="text-center text-xs uppercase tracking-wider text-muted">{label}</span>
          <span className="font-mono">{y}</span>
        </div>
      ))}
    </Panel>
  );
}

function Segmented<T extends number>({ label, value, options, onChange }: { label: string; value: T; options: readonly string[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 text-xs uppercase tracking-wider text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o, i) => (
          <button key={o} type="button" aria-pressed={value === i} onClick={() => onChange(i as T)} className={`min-h-11 flex-1 px-2 text-[13px] ${value === i ? "bg-cyan font-semibold text-bg" : "border border-line bg-[#0A1122] text-soft"}`}>
            {o}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function TacticsEditor({ value, onChange, compact = false }: { value: Tactics; onChange: (t: Tactics) => void; compact?: boolean }) {
  const set = <K extends keyof Tactics>(k: K, v: Tactics[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 text-xs uppercase tracking-wider text-muted">Formation</legend>
        <div className={`grid gap-2 ${compact ? "grid-cols-5" : "[grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]"}`}>
          {(Object.keys(FORMATIONS) as FormationKey[]).map((f) => (
            <button key={f} type="button" aria-pressed={value.formation === f} onClick={() => set("formation", f)} className={`flex flex-col gap-1.5 p-1.5 text-left ${value.formation === f ? "bg-[#0B1E2A] outline outline-2 outline-cyan" : "bg-transparent"}`}>
              <FormationDiagram f={f} active={value.formation === f} />
              <span className={`font-mono ${compact ? "text-[11px]" : "text-sm"} ${value.formation === f ? "text-cyan" : "text-soft"}`}>{compact ? f : FORMATIONS[f].name}</span>
            </button>
          ))}
        </div>
        {!compact && <p className="m-0 text-sm text-soft">{FORMATIONS[value.formation].description}</p>}
      </fieldset>
      <Segmented label="Mentality" value={value.mentality} options={compact ? ["V.Def", "Def", "Bal", "Att", "V.Att"] : MENTALITY_LABEL} onChange={(v) => set("mentality", v)} />
      <Segmented label="Pressing" value={value.pressing} options={PRESSING_LABEL} onChange={(v) => set("pressing", v)} />
      <Segmented label="Passing" value={value.passing} options={PASSING_LABEL} onChange={(v) => set("passing", v)} />
      <Segmented label="Width" value={value.width} options={WIDTH_LABEL} onChange={(v) => set("width", v)} />
    </div>
  );
}

function rgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Rough perceptual distance between two colours (weighted RGB). */
function colourGap(a: string, b: string) {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
}

/** Kits that look alike are unreadable on the pitch. The away side changes into a clearly different kit. */
function avoidClash(home: ClubDef, away: ClubDef): ClubDef {
  const MIN_GAP = 220;
  if (colourGap(home.color, away.color) >= MIN_GAP) return away;
  // Bright change kits only, so they also stand out on the dark green pitch.
  const options = ["#F4F7FB", "#2E6BFF", "#B07CFF", "#22E4F5", "#7CFF6B", "#FFC23D"];
  const alt = options.find((c) => colourGap(c, home.color) >= MIN_GAP && colourGap(c, "#0C3127") >= 250) ?? "#F4F7FB";
  const trim = colourGap(alt, "#070B14") > 300 ? "#070B14" : "#F4F7FB";
  return { ...away, color: alt, trim };
}

function feeLabel(fee: bigint | null) {
  return fee === null ? "… DOGE" : `${formatEther(fee)} DOGE`;
}

function KickOffNote({ status }: { status: KickOffStatus }) {
  if (status.k === "idle") return null;
  if (status.k === "connect") return <p className="m-0 text-sm text-amber" role="status">Connect your wallet to pay the match fee and kick off.</p>;
  if (status.k === "confirm") return <p className="m-0 text-sm text-soft" role="status">Confirm the match fee in your wallet…</p>;
  if (status.k === "mining")
    return (
      <p className="m-0 text-sm text-soft" role="status">
        Fee sent. Waiting for DogeOS to confirm… <a href={txUrl(status.hash)} target="_blank" rel="noreferrer">View ↗</a>
      </p>
    );
  return (
    <p className="m-0 text-sm text-danger" role="alert">
      {status.msg}
      {/faucet/i.test(status.msg) && (
        <>
          {" "}
          <a href={FAUCET} target="_blank" rel="noreferrer">Open the faucet ↗</a>
        </>
      )}
    </p>
  );
}

function Setup({ club, hasClub, rival, setRival, tactics, setTactics, onKickOff, fee, status, controlPick, setControlPick }: { club: ClubDef; hasClub: boolean; rival: ClubDef; setRival: (c: ClubDef) => void; tactics: Tactics; setTactics: (t: Tactics) => void; onKickOff: () => void; fee: bigint | null; status: KickOffStatus; controlPick: number | null; setControlPick: (v: number | null) => void }) {
  const busy = status.k === "confirm" || status.k === "mining";
  const squad = club.squad;
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-5 pb-14 pt-7 sm:px-8">
        <div className="flex flex-col gap-1.5">
          <Eyebrow className="text-amber">MATCH DAY · 1 DOGE ENTRY</Eyebrow>
          <h1 className="m-0 text-3xl font-bold">You're the manager of {club.name}</h1>
          <p className="m-0 max-w-3xl text-soft">Pick a rival, set your formation and tactics, then watch your AI players carry out the plan. Change things from the touchline at any time, and at half-time.</p>
        </div>
        {!hasClub && (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-amber/50 bg-[#1A1408] px-4 py-3">
            <span className="text-sm text-soft">You're playing with the demo squad. Create your own club to name your players, train them and keep your record.</span>
            <Link to="/club" className={btnGhost}>Create your club</Link>
          </div>
        )}

        <section className="flex flex-col gap-3">
          <Eyebrow>1 · CHOOSE YOUR OPPONENT</Eyebrow>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            {RIVALS.map((c) => (
              <button key={c.id} type="button" aria-pressed={rival.id === c.id} onClick={() => setRival(c)} className={`flex flex-col gap-2 border-2 p-4 text-left ${rival.id === c.id ? "border-cyan bg-[#0B1E2A]" : "border-line bg-surface"}`}>
                <span className="flex items-center gap-3">
                  <span className="size-6 border-2" style={{ background: c.color, borderColor: c.trim }} aria-hidden="true" />
                  <span className="text-lg font-semibold">{c.name}</span>
                </span>
                <span className="text-sm text-soft">AI manager style: <span className="text-ink">{STYLE_LABEL[c.style]}</span></span>
              </button>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-start gap-6">
          <section className="flex min-w-0 flex-[2_1_560px] flex-col gap-3">
            <Eyebrow>2 · SET YOUR TACTICS</Eyebrow>
            <Panel>
              <TacticsEditor value={tactics} onChange={setTactics} />
            </Panel>
            <Eyebrow>3 · PLAYER-MANAGER MODE (OPTIONAL)</Eyebrow>
            <Panel className="flex flex-col gap-3">
              <p className="m-0 text-sm text-soft">Control one of your players yourself while the AI plays the rest. Leave it off to manage from the touchline only.</p>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
                <button type="button" aria-pressed={controlPick === null} onClick={() => setControlPick(null)} className={`min-h-12 px-3 text-left text-sm ${controlPick === null ? "bg-[#0B1E2A] font-semibold text-cyan outline outline-2 outline-cyan" : "border border-line bg-[#0A1122] text-soft"}`}>
                  Off
                </button>
                {club.squad.map((p, i) =>
                  p.role === "GK" ? null : (
                    <button key={p.id} type="button" aria-pressed={controlPick === i} onClick={() => setControlPick(i)} className={`flex min-h-12 flex-col justify-center px-3 text-left text-sm ${controlPick === i ? "bg-[#0B1E2A] outline outline-2 outline-cyan" : "border border-line bg-[#0A1122]"}`}>
                      <span className={controlPick === i ? "font-semibold text-cyan" : "text-ink"}>#{p.number} {p.name}</span>
                      <span className="text-xs text-muted">{p.role}</span>
                    </button>
                  ),
                )}
              </div>
            </Panel>
          </section>
          <section className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
            <Eyebrow>YOUR SQUAD</Eyebrow>
            <Panel className="flex flex-col gap-3 p-4">
              {squad.map((p) => (
                <div key={p.id} className="flex flex-col gap-1 border-b border-line2 pb-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">#{p.number} {p.name}</span>
                    <span className="font-pixel text-[9px] text-cyan">{p.role}{p.style ? ` · ${styleLabel(p.style).toUpperCase()}` : ""}</span>
                  </span>
                  <span className="font-mono text-[11px] text-muted">
                    {p.role === "GK" ? `REF ${p.attrs.reflexes} · POS ${p.attrs.positioning}` : `PAC ${p.attrs.pace} · PAS ${p.attrs.passing} · SHO ${p.attrs.shooting} · DRI ${p.attrs.dribbling} · TAC ${p.attrs.tackling}`}
                  </span>
                </div>
              ))}
              <p className="m-0 text-xs text-muted">Players fill formation slots by role. A formation that needs more defenders than you have will put midfielders at the back.</p>
            </Panel>
            <button type="button" className={`${btnPrimary} py-4 text-[12px]`} onClick={onKickOff} disabled={busy}>
              {busy ? "KICKING OFF…" : `KICK OFF · ${feeLabel(fee)}`}
            </button>
            <KickOffNote status={status} />
            <p className="m-0 text-xs text-muted">
              Each match costs {feeLabel(fee)} on DogeOS Chikyū testnet. The fee goes to the reward reserve that pays season prizes, and the transaction sets the match seed so the result can be checked.{" "}
              <a href={FAUCET} target="_blank" rel="noreferrer">Get testnet DOGE ↗</a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
