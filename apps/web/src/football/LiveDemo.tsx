import { useCallback, useEffect, useRef, useState } from "react";
import { clubById, commentate, createMatch, matchMinute, step, type MatchState } from "@dogefc/engine";
import { PitchCanvas } from "./PitchCanvas";
import type { FrameSource } from "./PitchScene";

const TICK_MS = 50; // demo runs at 2× speed

function newMatch(n: number) {
  return createMatch(
    { seed: `landing-demo:${n}`, home: clubById("harbour-rovers"), away: clubById("neon-strikers"), halfTicks: 900, aiControls: [true, true] },
  );
}

/** Two AI-managed clubs playing a real match on loop. */
export default function LiveDemo() {
  const sim = useRef<{ state: MatchState; prev: MatchState | null; acc: number; last: number; n: number }>({
    state: newMatch(0),
    prev: null,
    acc: 0,
    last: 0,
    n: 0,
  });
  const [, setUi] = useState(0);

  useEffect(() => {
    let raf = 0;
    sim.current.last = performance.now();
    const loop = (now: number) => {
      const s = sim.current;
      s.acc += Math.min(250, now - s.last);
      s.last = now;
      while (s.acc >= TICK_MS) {
        s.acc -= TICK_MS;
        if (s.state.phase === "fulltime") {
          s.n += 1;
          s.state = newMatch(s.n);
          s.prev = null;
          continue;
        }
        s.prev = { tick: s.state.tick, players: s.state.players.map((p) => ({ pos: { ...p.pos } })), ball: { pos: { ...s.state.ball.pos } } } as unknown as MatchState;
        step(s.state);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ui = setInterval(() => setUi((x) => x + 1), 400);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(ui);
    };
  }, []);

  const source = useCallback((): FrameSource => {
    const s = sim.current;
    return { prev: s.prev, cur: s.state, alpha: Math.min(1, s.acc / TICK_MS) };
  }, []);

  const s = sim.current.state;
  const last = commentate(s, s.events).filter((l) => l.tone !== "info").slice(-1)[0];
  return (
    <div className="w-full max-w-[680px] border-2 border-line bg-surface p-2.5 shadow-[0_0_0_6px_#0A0F1B,0_0_60px_rgba(34,228,245,0.08)] sm:p-3">
      <div className="flex items-center justify-between px-1 pb-2.5 font-pixel text-[10px]">
        <span style={{ color: s.config.home.color }}>{s.config.home.short}</span>
        <span className="text-ink">{s.score[0]} – {s.score[1]} <span className="text-muted">· {String(matchMinute(s)).padStart(2, "0")}'</span></span>
        <span style={{ color: s.config.away.color }}>{s.config.away.short}</span>
      </div>
      <PitchCanvas source={source} matchKey={`demo-${sim.current.n}`} />
      <p className="m-0 min-h-[40px] px-1 pt-2.5 font-mono text-xs leading-relaxed text-soft">
        <span className="text-cyan">LIVE › </span>
        {last ? last.text : "Two AI-managed clubs, no human input. Every touch is a decision."}
      </p>
    </div>
  );
}
