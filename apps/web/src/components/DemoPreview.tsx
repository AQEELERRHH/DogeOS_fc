import { useEffect, useState } from "react";
import { type GameState, PERSONALITIES, buildConfig, replayFrames } from "@aftermaze/engine";
import { ArenaCanvas } from "../game/ArenaCanvas";
import { runInWorker } from "../simClient";

/** A real autonomous match, looping on the landing page. */
export default function DemoPreview() {
  const [frames, setFrames] = useState<GameState[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [reason, setReason] = useState("");
  const [decisions, setDecisions] = useState<{ t: number; reason: string }[]>([]);

  useEffect(() => {
    let alive = true;
    const config = buildConfig({ mode: "training", seed: "landing-demo-3", level: 3 });
    const policy = { version: 1, personality: "explorer" as const, weights: { ...PERSONALITIES.explorer.weights }, prefs: { corridorCaution: false } };
    runInWorker(config, policy).then((r) => {
      if (!alive) return;
      setDecisions(r.decisions.map((d) => ({ t: d.t, reason: d.reason })));
      setFrames([...replayFrames(config, r.actions)]);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!frames) return;
    const end = idx >= frames.length - 1;
    const t = setTimeout(() => setIdx(end ? 0 : idx + 1), end ? 2500 : 110);
    return () => clearTimeout(t);
  }, [frames, idx]);

  useEffect(() => {
    if (!frames) return;
    const d = decisions.find((x) => x.t === frames[idx].tick);
    if (d) setReason(d.reason);
  }, [frames, idx, decisions]);

  const f = frames?.[idx];
  return (
    <div className="w-full max-w-[640px] border-2 border-line bg-surface p-3 shadow-[0_0_0_6px_#0A0F1B,0_0_60px_rgba(34,228,245,0.08)] sm:p-4">
      <div className="flex items-center justify-between px-0.5 pb-3 font-pixel text-[10px] text-muted">
        <span>LIVE DEMO</span>
        <span className="text-ok">CRYSTALS {f?.agent.collected ?? 0}/3</span>
        <span className="text-cyan">T {String(f?.tick ?? 0).padStart(3, "0")}</span>
      </div>
      {frames ? (
        <ArenaCanvas frames={frames} index={idx} tickMs={110} label="A live autonomous match in THE GRID" />
      ) : (
        <div className="grid aspect-[19/13] place-items-center bg-[#0A1122] font-pixel text-[10px] text-muted">BOOTING THE GRID…</div>
      )}
      <p className="m-0 min-h-[40px] px-0.5 pt-3 font-mono text-xs leading-relaxed text-soft">
        <span className="text-cyan">NOVA › </span>
        {reason || "Planning a route…"}
      </p>
    </div>
  );
}
