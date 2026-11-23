import type { MatchConfig } from "../config";
import { runMatch, type MatchResult } from "../match";
import {
  DIMENSIONS,
  type Dimension,
  type Policy,
  type PolicyHistory,
  type PolicyVersion,
  type Weights,
  activePolicy,
  clampWeight,
  deriveVersion,
} from "./policy";

/** Largest change to any single dimension from one learning step. */
export const MAX_LEARNING_STEP = 6;
/** How many recent mazes NOVA "replays in its head" when evaluating adjustments. */
export const MEMORY_SIZE = 5;
/** Occasionally-tested larger step, still bounded, for when small nudges don't change behaviour. */
export const BIG_STEP = 15;

export interface Finding {
  dimension: Dimension;
  delta: number;
  reason: string;
}

export interface MatchAnalysis {
  matchId: string;
  outcome: MatchResult["status"];
  cause: "enemy" | "collapse" | "timeout" | null;
  /** Rule-based diagnosis of what went wrong / right. Used to prioritise and explain adjustments. */
  findings: Finding[];
  summary: string;
}

/** Diagnoses a finished match. Findings are hypotheses; learning tests them before adopting any. */
export function analyseMatch(result: MatchResult, previous: MatchAnalysis[] = []): MatchAnalysis {
  const st = result.stats;
  const f: Finding[] = [];
  const add = (dimension: Dimension, delta: number, reason: string) => f.push({ dimension, delta, reason });
  const cause: MatchAnalysis["cause"] =
    result.status === "destroyed" ? st.deathCause : result.status === "timeout" ? "timeout" : null;

  if (cause === "enemy") add("survival", 4, "Destroyed by an enemy");
  if (cause === "collapse") add("survival", 4, "Caught in a maze collapse");
  if (cause === "timeout") add("efficiency", 4, "Ran out of time");
  if (cause === "timeout" && st.crystals < 3) add("exploration", -4, "Detours cost time");
  if (st.damageTaken > 0 && cause !== "enemy") add("survival", 4, `Took ${st.damageTaken} hit(s)`);
  if (st.bombsWasted > 0) add("resourcefulness", 4, `Wasted ${st.bombsWasted} bomb(s)`);
  if (st.bombsUsed === 0 && st.damageTaken >= 2 && result.config.bombs > 0) add("aggression", 4, "Took heavy damage while holding bombs");
  if (st.bombsUsed === result.config.bombs && st.damageTaken >= 2) add("resourcefulness", 4, "Ran out of bombs before the danger was over");
  if (st.deadEnds >= 4) add("exploration", -4, `Entered ${st.deadEnds} dead ends`);
  if (st.oscillations >= 15) add("efficiency", 4, "Kept doubling back");
  if (result.status === "escaped" && st.damageTaken === 0) add("efficiency", 4, "Clean escape — could push for a faster time");
  if (result.status === "escaped" && st.bonuses < result.config.bonusItems) add("exploration", 4, "Escaped but left bonus items behind");

  const last = previous[previous.length - 1];
  const repeated = cause && last?.cause === cause;

  const summary =
    (result.status === "escaped"
      ? `Escaped with ${result.score.total} points.`
      : result.status === "timeout"
        ? `Timed out with ${st.crystals}/3 crystals.`
        : `Destroyed by ${cause === "collapse" ? "a collapse" : "an enemy"} with ${st.crystals}/3 crystals.`) +
    (repeated ? ` Same failure as last match.` : "");

  return { matchId: result.id, outcome: result.status, cause, findings: f, summary };
}

export interface Experience {
  matchId: string;
  config: MatchConfig;
}

/** Keeps the most recent mazes (newest last). Training mazes count; that's what training is for. */
export function remember(memory: Experience[], result: MatchResult): Experience[] {
  return [...memory.filter((e) => e.matchId !== result.id), { matchId: result.id, config: result.config }].slice(-MEMORY_SIZE);
}

interface Evaluation {
  score: number;
  escapes: number;
}

function evaluate(policy: Policy, memory: Experience[]): Evaluation {
  let score = 0;
  let escapes = 0;
  for (const e of memory) {
    const r = runMatch(e.config, policy);
    score += r.score.total;
    if (r.status === "escaped") escapes++;
  }
  return { score: Math.round(score / Math.max(1, memory.length)), escapes };
}

export interface LearningReport {
  analysis: MatchAnalysis;
  tested: { change: string; score: number; escapes: number }[];
  baseline: Evaluation;
  adopted: { change: string; score: number; escapes: number } | null;
  explanation: string;
}

/**
 * Experience-replay learning. NOVA replays its last few mazes in simulation with small,
 * bounded weight adjustments (diagnosed ones first) and keeps the best one only if it
 * would have done better. Deterministic, explainable, and never makes the remembered
 * performance worse.
 */
export function learnFromMatch(
  history: PolicyHistory,
  result: MatchResult,
  memory: Experience[],
  previous: MatchAnalysis[] = [],
  maxCandidates = 20,
): { history: PolicyHistory; version: PolicyVersion | null; memory: Experience[]; report: LearningReport } {
  const analysis = analyseMatch(result, previous);
  const nextMemory = remember(memory, result);
  const base = activePolicy(history);
  const baseline = evaluate(base, nextMemory);

  // Candidate adjustments: diagnosed directions first, then single-dimension probes.
  const seen = new Set<string>();
  const candidates: { dim: Dimension; delta: number; reason: string }[] = [];
  const push = (dim: Dimension, delta: number, reason: string) => {
    const key = `${dim}:${delta}`;
    const to = clampWeight(base.weights[dim] + delta);
    if (seen.has(key) || to === base.weights[dim]) return;
    seen.add(key);
    candidates.push({ dim, delta: to - base.weights[dim], reason });
  };
  for (const f of analysis.findings) push(f.dimension, Math.sign(f.delta) * MAX_LEARNING_STEP, f.reason);
  // Rotate probe order with the version number so different dimensions get explored over time.
  const rot = base.version % DIMENSIONS.length;
  const dims = [...DIMENSIONS.slice(rot), ...DIMENSIONS.slice(0, rot)];
  for (const d of dims) {
    push(d, MAX_LEARNING_STEP, "Exploratory adjustment");
    push(d, -MAX_LEARNING_STEP, "Exploratory adjustment");
  }
  for (const d of dims) {
    push(d, BIG_STEP, "Larger exploratory adjustment");
    push(d, -BIG_STEP, "Larger exploratory adjustment");
  }

  const tested: LearningReport["tested"] = [];
  let best: { c: (typeof candidates)[number]; ev: Evaluation } | null = null;
  for (const c of candidates.slice(0, maxCandidates)) {
    const weights: Weights = { ...base.weights, [c.dim]: base.weights[c.dim] + c.delta };
    const ev = evaluate({ ...base, weights }, nextMemory);
    const label = `${c.dim} ${c.delta > 0 ? "+" : ""}${c.delta}`;
    tested.push({ change: label, ...ev });
    const better = ev.escapes > baseline.escapes || (ev.escapes === baseline.escapes && ev.score > baseline.score);
    const beatsBest = !best || ev.escapes > best.ev.escapes || (ev.escapes === best.ev.escapes && ev.score > best.ev.score);
    if (better && beatsBest) best = { c, ev };
  }

  const n = nextMemory.length;
  let out = { history, version: null as PolicyVersion | null };
  let adopted: LearningReport["adopted"] = null;
  let explanation: string;
  if (best) {
    const label = `${best.c.dim} ${best.c.delta > 0 ? "+" : ""}${best.c.delta}`;
    adopted = { change: label, ...best.ev };
    explanation =
      `${analysis.summary} Replayed the last ${n} maze${n === 1 ? "" : "s"} with ${tested.length} adjustments. ` +
      `${label} worked best: average score ${baseline.score} → ${best.ev.score}, escapes ${baseline.escapes} → ${best.ev.escapes} of ${n}.`;
    out = deriveVersion(
      history,
      "learning",
      { [best.c.dim]: { delta: best.c.delta, reason: `${best.c.reason}; replay: avg ${baseline.score} → ${best.ev.score}` } },
      explanation,
      result.id,
    );
  } else {
    explanation = `${analysis.summary} Replayed the last ${n} maze${n === 1 ? "" : "s"} with ${tested.length} adjustments; none beat the current strategy, so it was kept.`;
  }

  return { ...out, memory: nextMemory, report: { analysis, tested, baseline, adopted, explanation } };
}
