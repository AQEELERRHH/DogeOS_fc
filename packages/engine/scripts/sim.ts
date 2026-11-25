import { CLUBS, STYLE_TACTICS, simulate, type Tactics, type MatchConfig, FORMATIONS, type FormationKey } from "../src/index";
const args = process.argv.slice(2);
const N = Number(args[0] ?? 60);
function run(home: string, away: string, n: number, t0?: Tactics | null, ai: [boolean, boolean] = [true, true]) {
  const h = CLUBS.find((c) => c.id === home)!, a = CLUBS.find((c) => c.id === away)!;
  const agg = { hg: 0, ag: 0, hw: 0, d: 0, aw: 0, shots: 0, ont: 0, passes: 0, comp: 0, poss: 0, tackles: 0, saves: 0 };
  for (let i = 0; i < n; i++) {
    const cfg: MatchConfig = { seed: `bal:${i}`, home: h, away: a, halfTicks: 900, aiControls: ai };
    const s = simulate(cfg, [t0 ?? null, null]);
    agg.hg += s.score[0]; agg.ag += s.score[1];
    if (s.score[0] > s.score[1]) agg.hw++; else if (s.score[0] === s.score[1]) agg.d++; else agg.aw++;
    for (const st of s.stats) { agg.shots += st.shots; agg.ont += st.onTarget; agg.passes += st.passes; agg.comp += st.passesCompleted; agg.tackles += st.tackles; agg.saves += st.saves; }
    agg.poss += s.stats[0].possessionTicks / Math.max(1, s.stats[0].possessionTicks + s.stats[1].possessionTicks);
  }
  const f = (x: number) => (x / n).toFixed(1);
  return `goals ${f(agg.hg)}-${f(agg.ag)}  W/D/L ${agg.hw}/${agg.d}/${agg.aw}  shots ${f(agg.shots)} (on ${f(agg.ont)})  passes ${f(agg.passes)} (${Math.round(100*agg.comp/Math.max(1,agg.passes))}%)  poss ${Math.round(100*agg.poss/n)}%  tackles ${f(agg.tackles)} saves ${f(agg.saves)}`;
}
const t0 = Date.now();
console.log("DOGE FC vs each club (both AI-managed):");
for (const c of CLUBS.slice(1)) console.log(`  vs ${c.name.padEnd(15)} ${run("doge-fc", c.id, N)}`);
console.log(`\nDOGE FC formations vs Harbour Rovers (DOGE FC fixed tactics, no AI changes for DOGE FC):`);
for (const f of Object.keys(FORMATIONS) as FormationKey[]) console.log(`  ${f.padEnd(6)} ${run("doge-fc", "harbour-rovers", N, { ...STYLE_TACTICS.balanced, formation: f }, [false, true])}`);
console.log(`\nMentality (1-2-1) vs Iron Wolves:`);
for (const m of [0,2,4] as const) console.log(`  mentality ${m} ${run("doge-fc", "iron-wolves", N, { ...STYLE_TACTICS.balanced, mentality: m }, [false, true])}`);
console.log(`\n${Date.now()-t0}ms`);
