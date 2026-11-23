import { useMemo, useState } from "react";
import { type CoachingInterpretation, PERSONALITIES, activePolicy } from "@aftermaze/engine";
import { Eyebrow, Label, Page, Panel, WEIGHT_META, btnGhost, btnPrimary } from "../components/ui";
import { coach, rollbackTo, useSave } from "../store";

const EXAMPLES = ["Avoid enemies whenever possible", "Stop wasting bombs", "Choose shorter routes", "Don't enter narrow corridors when the Seeker is nearby"];
const TAG: Record<string, string> = { learning: "text-ok", coaching: "text-cyan", rollback: "text-amber", personality: "text-violet" };

export function Workshop() {
  const save = useSave();
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ interp: CoachingInterpretation; changed: boolean } | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const history = save.policies!;
  const p = activePolicy(history);
  const base = PERSONALITIES[p.personality].weights;
  const parent = history.versions.find((v) => v.version === p.parent) ?? null;
  const versions = useMemo(() => [...history.versions].reverse(), [history]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const out = coach(text);
    if (out) setResult({ interp: out.interpretation, changed: !!out.version });
    setText("");
  };

  return (
    <Page>
      <div className="flex flex-col gap-1.5">
        <Eyebrow>AGENT WORKSHOP</Eyebrow>
        <h1 className="m-0 text-3xl font-bold">Train {save.agent?.name}</h1>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <Panel className="flex flex-col gap-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Label>Behaviour weights</Label>
              <span className="font-mono text-[13px] text-soft">
                {PERSONALITIES[p.personality].label} · strategy v{p.version} · range 5–95
              </span>
            </div>
            <div className="flex flex-col gap-3.5">
              {WEIGHT_META.map((w) => {
                const v = p.weights[w.key];
                const before = parent?.weights[w.key] ?? v;
                const d = v - before;
                return (
                  <div key={w.key} className="grid grid-cols-[120px_minmax(0,1fr)_80px] items-center gap-4 sm:grid-cols-[150px_minmax(0,1fr)_90px]">
                    <span>{w.name}</span>
                    <div className="relative h-3.5 bg-line2" role="img" aria-label={`${w.name} ${v} out of 95`}>
                      <div className="absolute inset-y-0 left-0" style={{ width: `${v}%`, background: w.color }} />
                      <div className="absolute -inset-y-1 w-0.5 bg-muted" style={{ left: `${base[w.key]}%` }} title="Personality starting point" />
                    </div>
                    <span className="text-right font-mono text-sm">
                      {v} {d !== 0 && <span className={d > 0 ? "text-ok" : "text-[#FF7A90]"}>{d > 0 ? `+${d}` : d}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span className="inline-block h-3 w-0.5 bg-muted" aria-hidden="true" /> starting point for {PERSONALITIES[p.personality].label}
              {p.prefs.corridorCaution && <span className="ml-auto bg-amber px-2.5 py-1 font-mono text-[13px] text-bg">ON · Corridor caution near Seekers</span>}
            </div>
          </Panel>

          <form onSubmit={submit} className="flex flex-col gap-3.5 border border-cyan bg-[#05080F] p-6">
            <label htmlFor="coach" className="font-pixel text-[11px] text-cyan">COACH {save.agent?.name.toUpperCase()}</label>
            <textarea
              id="coach"
              rows={3}
              value={text}
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Avoid enemies and stop wasting bombs"
              className="resize-y border border-line bg-[#0A1122] p-3.5 font-mono text-[15px] leading-normal text-ink"
            />
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="submit" className={btnPrimary} disabled={!text.trim()}>TRANSMIT</button>
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setText(ex)} className="min-h-11 border border-line px-3 text-sm text-soft hover:border-cyan">{ex}</button>
              ))}
            </div>
            {result && (
              <div className="flex flex-col gap-2 border-t border-line2 pt-3.5 font-mono text-sm leading-normal" role="status">
                {result.interp.intents.map((i) => (
                  <span key={i.clause} className="text-ok">✓ Understood: {i.understood}</span>
                ))}
                {result.interp.ignored.map((g) => (
                  <span key={g} className="text-amber">? Not understood: "{g}" (ignored, never executed)</span>
                ))}
                {!result.changed && result.interp.intents.length > 0 && <span className="text-muted">No weight changed: those behaviours are already at their limit.</span>}
                {result.changed && <span className="text-soft">Saved as strategy v{p.version}. The previous version is kept below.</span>}
              </div>
            )}
          </form>
        </div>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
          <Panel className="flex flex-col gap-2">
            <Label>Strategy versions</Label>
            <ol className="m-0 flex list-none flex-col p-0">
              {versions.map((v) => (
                <li key={v.version} className="grid grid-cols-[52px_minmax(0,1fr)] gap-3 border-b border-line2 py-3">
                  <span className="pt-0.5 font-pixel text-[10px] text-cyan">v{v.version}</span>
                  <div className="flex flex-col gap-1">
                    <span className={`font-pixel text-[9px] ${TAG[v.source]}`}>
                      {v.source.toUpperCase()} {v.version === history.active && <span className="text-ink">· ACTIVE</span>}
                    </span>
                    <span className="text-[15px] leading-snug">{v.note}</span>
                    {v.changes.length > 0 && (
                      <span className="font-mono text-xs text-muted">
                        {v.changes.map((c) => `${c.dimension} ${String(c.from)} → ${String(c.to)}`).join(" · ")}
                      </span>
                    )}
                    {v.version !== history.active && (
                      confirm === v.version ? (
                        <span className="flex flex-wrap gap-2 pt-1">
                          <button type="button" className={btnGhost} onClick={() => { rollbackTo(v.version); setConfirm(null); }}>Confirm rollback to v{v.version}</button>
                          <button type="button" className={btnGhost} onClick={() => setConfirm(null)}>Cancel</button>
                        </span>
                      ) : (
                        <button type="button" className="self-start pt-1 text-sm text-violet underline" onClick={() => setConfirm(v.version)}>Roll back to this version</button>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </aside>
      </div>
    </Page>
  );
}
