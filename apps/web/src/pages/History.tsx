import { Link, useParams } from "react-router-dom";
import { Eyebrow, Label, MODE_LABEL, Page, Panel, btnGhost, btnPrimary } from "../components/ui";
import { useSave, type MatchRecord } from "../store";

const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function RunsChart({ runs, highlight }: { runs: MatchRecord[]; highlight?: string }) {
  const list = [...runs].reverse().slice(-12);
  if (!list.length) return null;
  const max = Math.max(1100, ...list.map((r) => r.score.total));
  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label>Last {list.length} runs</Label>
        <div className="flex gap-4 text-[13px] text-soft">
          <span className="flex items-center gap-1.5"><span className="size-3 bg-ok" />Escaped</span>
          <span className="flex items-center gap-1.5"><span className="size-3 bg-danger" />Failed</span>
        </div>
      </div>
      <div
        role="img"
        aria-label={`Scores of the last ${list.length} runs: ${list.map((r) => r.score.total).join(", ")}`}
        className="grid h-[200px] items-end gap-2 border-b border-line sm:gap-3"
        style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}
      >
        {list.map((r) => (
          <Link key={r.id} to={`/history/${r.id}`} className="flex h-full flex-col items-center justify-end gap-1.5 no-underline">
            <span className="font-mono text-[11px] text-soft">{r.score.total}</span>
            <span
              className={`w-full max-w-14 ${r.status === "escaped" ? "bg-ok" : "bg-danger"}`}
              style={{ height: `${Math.max(4, Math.round((r.score.total / max) * 160))}px`, boxShadow: r.id === highlight ? "0 0 0 2px #070B14, 0 0 0 4px #22E4F5" : undefined }}
            />
          </Link>
        ))}
      </div>
    </Panel>
  );
}

export function History() {
  const save = useSave();
  return (
    <Page>
      <div className="flex flex-col gap-1.5">
        <Eyebrow>HISTORY</Eyebrow>
        <h1 className="m-0 text-3xl font-bold">{save.agent?.name}'s matches</h1>
      </div>
      {save.matches.length === 0 ? (
        <Panel className="flex flex-col items-start gap-4">
          <p className="m-0 text-soft">No matches yet. Send your agent into THE GRID.</p>
          <Link to="/arena" className={btnPrimary}>ENTER THE GRID</Link>
        </Panel>
      ) : (
        <>
          <RunsChart runs={save.matches} />
          <Panel className="overflow-x-auto p-0 sm:p-0">
            <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
              <thead className="text-xs uppercase tracking-wider text-muted">
                <tr>
                  {["When", "Mode", "Level", "Result", "Crystals", "Score", "Strategy"].map((h) => (
                    <th key={h} className="border-b border-line px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {save.matches.map((m) => (
                  <tr key={m.id} className="border-b border-line2 hover:bg-bg2">
                    <td className="px-4 py-3"><Link to={`/history/${m.id}`} className="text-cyan">{when(m.at)}</Link></td>
                    <td className="px-4 py-3">{MODE_LABEL[m.mode]}{m.floor !== undefined ? ` · floor ${m.floor + 1}` : ""}</td>
                    <td className="px-4 py-3">{m.config.level}</td>
                    <td className={`px-4 py-3 ${m.status === "escaped" ? "text-ok" : "text-danger"}`}>{m.status}</td>
                    <td className="px-4 py-3">{m.stats.crystals}/3</td>
                    <td className="px-4 py-3 font-mono">{m.score.total}{m.newBest && <span className="ml-2 text-xs text-ok">BEST</span>}</td>
                    <td className="px-4 py-3 font-mono text-muted">v{m.policy.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </Page>
  );
}

export function Debrief() {
  const { id } = useParams();
  const save = useSave();
  const m = save.matches.find((x) => x.id === id);
  if (!m) {
    return (
      <Page>
        <Panel className="flex flex-col items-start gap-4">
          <p className="m-0">That match isn't on this device.</p>
          <Link to="/history" className={btnGhost}>Back to history</Link>
        </Panel>
      </Page>
    );
  }
  const good = m.status === "escaped";
  const s = m.score;
  const rows = [
    ["Energy crystals", `${m.stats.crystals} × 100`, s.crystals],
    ["Bonus items", `${m.stats.bonuses} × 25`, s.bonuses],
    ["Escape", "", s.escape],
    ["Enemies stunned", `${m.stats.enemiesStunned} × 50`, s.stuns],
    ["No-damage run", "", s.noDamage],
    ["Speed bonus", good ? `${m.config.maxTicks - m.stats.ticks} ticks to spare` : "", s.speed],
  ] as const;
  const head = good ? "ESCAPED" : m.status === "timeout" ? "TIME UP" : m.stats.deathCause === "collapse" ? "CRUSHED BY A COLLAPSE" : "DESTROYED";
  return (
    <Page>
      <section className={`flex flex-wrap items-center justify-between gap-6 border-2 px-6 py-7 sm:px-8 ${good ? "border-ok bg-[#071A12]" : "border-danger bg-[#1A070C]"}`}>
        <div className="flex flex-col gap-2.5">
          <Eyebrow className={good ? "text-ok" : "text-danger"}>
            {MODE_LABEL[m.mode].toUpperCase()}{m.floor !== undefined ? ` · FLOOR ${m.floor + 1}` : ""} · LEVEL {m.config.level} · STRATEGY v{m.policy.version}
          </Eyebrow>
          <h1 className="m-0 font-pixel text-2xl leading-snug sm:text-3xl">{head}</h1>
          <span className="text-[17px] text-soft">
            {m.stats.crystals}/3 crystals · {m.stats.damageTaken} hit{m.stats.damageTaken === 1 ? "" : "s"} · {m.stats.ticks} ticks
            {m.newBest && <span className="text-ok"> · new personal best</span>}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="text-[13px] uppercase tracking-wider text-muted">Final score</span>
          <span className={`font-pixel text-4xl ${good ? "text-ok" : "text-ink"}`}>{s.total}</span>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <Panel className="flex min-w-0 flex-[1_1_360px] flex-col gap-3.5">
          <Label>Score breakdown</Label>
          {rows.map(([label, detail, pts]) => (
            <div key={label} className="flex justify-between gap-3 border-b border-line2 pb-3">
              <span>{label} <span className="text-sm text-muted">{detail}</span></span>
              <span className="font-pixel text-[13px] text-cyan">+{pts}</span>
            </div>
          ))}
          <div className="flex justify-between text-lg font-semibold">
            <span>Total</span>
            <span className="font-pixel text-sm text-ok">{s.total}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 text-sm text-soft sm:grid-cols-3">
            <span>Bombs used: {m.stats.bombsUsed}</span>
            <span>Bombs wasted: {m.stats.bombsWasted}</span>
            <span>Trail cleared: {m.stats.trailCleared}</span>
            <span>Dead ends: {m.stats.deadEnds}</span>
            <span>Collapses survived: {m.stats.collapsesSurvived}</span>
            <span>Distance: {m.stats.distance}</span>
          </div>
        </Panel>

        <section className="flex min-w-0 flex-[1_1_420px] flex-col gap-4 border border-cyan bg-[#05080F] p-6">
          <h2 className="m-0 font-pixel text-[11px] text-cyan">WHAT {(save.agent?.name ?? "NOVA").toUpperCase()} LEARNED</h2>
          {m.learning ? (
            <>
              <p className="m-0 text-[17px] leading-relaxed">{m.learning.explanation}</p>
              {m.learning.adopted && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5 border border-line p-3.5">
                    <span className="text-xs uppercase tracking-wider text-muted">Avg score on replay</span>
                    <span className="font-pixel text-sm">{m.learning.baseline.score} → <span className="text-ok">{m.learning.adopted.score}</span></span>
                  </div>
                  <div className="flex flex-col gap-1.5 border border-line p-3.5">
                    <span className="text-xs uppercase tracking-wider text-muted">Escapes on replay</span>
                    <span className="font-pixel text-sm">{m.learning.baseline.escapes} → <span className="text-ok">{m.learning.adopted.escapes}</span></span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="m-0 text-soft">No learning step was recorded for this match.</p>
          )}
          <div className="flex flex-wrap gap-2.5">
            <Link to="/arena" className={btnPrimary}>RUN AGAIN</Link>
            <Link to={`/arena?replay=${m.id}`} className={btnGhost}>Watch replay</Link>
            <Link to="/workshop" className={btnGhost}>Coach</Link>
          </div>
          <p className="m-0 break-all font-mono text-[11px] text-muted">Replay hash {m.replayHash}</p>
        </section>
      </div>
      <RunsChart runs={save.matches} highlight={m.id} />
    </Page>
  );
}
