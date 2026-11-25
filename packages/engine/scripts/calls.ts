import { CLUBS, simulate, type MatchInput } from "../src/index";
const cfg = (seed: string) => ({ seed, home: CLUBS[0], away: CLUBS[3], halfTicks: 900, aiControls: [false, true] as [boolean, boolean] });
for (const call of ["shoot", "press", "keep", "attack"] as const) {
  let base = { shots: 0, goals: 0, ga: 0, poss: 0 }, w = { shots: 0, goals: 0, ga: 0, poss: 0 };
  const N = 60;
  for (let i = 0; i < N; i++) {
    const inputs: MatchInput[] = [0, 300, 600, 950, 1250, 1550].map((t) => ({ t, team: 0 as const, call }));
    const a = simulate(cfg(`c-${i}`)); const b = simulate(cfg(`c-${i}`), undefined, inputs);
    const P = (s: any) => s.stats[0].possessionTicks / (s.stats[0].possessionTicks + s.stats[1].possessionTicks);
    base.shots += a.stats[0].shots; base.goals += a.score[0]; base.ga += a.score[1]; base.poss += P(a);
    w.shots += b.stats[0].shots; w.goals += b.score[0]; w.ga += b.score[1]; w.poss += P(b);
  }
  const f = (o: any) => `shots ${(o.shots / N).toFixed(1)} goals ${(o.goals / N).toFixed(2)}-${(o.ga / N).toFixed(2)} poss ${((o.poss / N) * 100).toFixed(0)}%`;
  console.log(call.padEnd(7), "base:", f(base), "| with:", f(w));
}
