/**
 * Watch NOVA train from the terminal.
 *
 *   npm run simulate -- --personality survivor --matches 20 --level 2
 *   npm run simulate -- --seed my-seed --watch          (prints the board every tick)
 *   npm run simulate -- --coach "stop wasting bombs"   (coaching before the first match)
 *   npm run simulate -- --same-maze --matches 6          (retry one maze and watch NOVA adapt)
 */
import {
  PERSONALITIES,
  activePolicy,
  applyCoaching,
  buildConfig,
  learnFromMatch,
  newPolicyHistory,
  renderAscii,
  runMatch,
  type Experience,
  type MatchAnalysis,
  type Personality,
} from "../src/index";

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const flag = (name: string) => args.includes(`--${name}`);

const personality = opt("personality", "explorer") as Personality;
if (!PERSONALITIES[personality]) throw new Error(`personality must be one of ${Object.keys(PERSONALITIES).join(", ")}`);
const matches = Number(opt("matches", "10"));
const level = Number(opt("level", "1"));
const baseSeed = opt("seed", "training");
const coach = opt("coach", "");

let history = newPolicyHistory(personality);
if (coach) {
  const c = applyCoaching(history, coach);
  history = c.history;
  console.log(`Coaching: "${coach}"`);
  for (const i of c.interpretation.intents) console.log(`  understood → ${i.understood}`);
  for (const i of c.interpretation.ignored) console.log(`  not understood → "${i}"`);
}

const analyses: MatchAnalysis[] = [];
let memory: Experience[] = [];
const sameMaze = flag("same-maze");
let escapes = 0;
for (let m = 0; m < matches; m++) {
  const policy = activePolicy(history);
  const config = buildConfig({ mode: "training", seed: sameMaze ? baseSeed : `${baseSeed}:${m}`, level });
  const result = runMatch(config, policy, {
    onTick: flag("watch") && m === 0 ? (s, d) => console.log(`\n${renderAscii(s)}\n> ${d.action}: ${d.reason}`) : undefined,
  });
  if (result.status === "escaped") escapes++;
  const learned = learnFromMatch(history, result, memory, analyses);
  analyses.push(learned.report.analysis);
  memory = learned.memory;
  history = learned.history;
  const w = policy.weights;
  console.log(
    `#${String(m + 1).padStart(2)} v${String(policy.version).padStart(2)} ${result.status.padEnd(9)} score ${String(result.score.total).padStart(4)}  crystals ${result.stats.crystals}/3  hits ${result.stats.damageTaken}  bombs ${result.stats.bombsUsed}(${result.stats.bombsWasted} wasted)  ticks ${String(result.stats.ticks).padStart(3)}  ` +
      `[exp ${w.exploration} sur ${w.survival} eff ${w.efficiency} agg ${w.aggression} res ${w.resourcefulness}]`,
  );
  console.log(`      ${learned.report.explanation}`);
}
console.log(`\n${personality} @ level ${level}: escaped ${escapes}/${matches}`);
