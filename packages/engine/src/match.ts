import { decide, type Intent } from "./agent/brain";
import type { Policy } from "./agent/policy";
import { buildConfig, type MatchConfig } from "./config";
import { replayHash, encodeActions } from "./replay";
import { createGame, step, type CreateOptions, type GameState } from "./sim";
import type { Action, GameEvent, MatchStats, MatchStatus, ScoreBreakdown } from "./types";

export interface DecisionLog {
  t: number;
  action: Action;
  intent: Intent;
  reason: string;
}

export interface MatchResult {
  id: string;
  config: MatchConfig;
  policy: Policy;
  status: Exclude<MatchStatus, "running">;
  score: ScoreBreakdown;
  stats: MatchStats;
  /** One char per tick: U D L R B W E. */
  actions: string;
  decisions: DecisionLog[];
  events: GameEvent[];
  /** keccak256 over the canonical replay; the value sealed in MatchResults. */
  replayHash: `0x${string}`;
}

export interface RunOptions extends CreateOptions {
  /** Called after every tick (for live viewers / debugging). */
  onTick?: (state: GameState, decision: DecisionLog) => void;
}

/** Runs a full autonomous match. Deterministic: same config + policy ⇒ same result. */
export function runMatch(config: MatchConfig, policy: Policy, opts: RunOptions = {}): MatchResult {
  const s = createGame(config, opts);
  const actions: Action[] = [];
  const decisions: DecisionLog[] = [];
  while (s.status === "running") {
    const d = decide(s, policy);
    const log = { t: s.tick, action: d.action, intent: d.intent, reason: d.reason };
    actions.push(d.action);
    decisions.push(log);
    step(s, d.action);
    opts.onTick?.(s, log);
  }
  const status = s.status as MatchResult["status"];
  const encoded = encodeActions(actions);
  const hash = replayHash({ config, policy, actions: encoded, score: s.score.total, status, hp: opts.hp });
  return {
    id: hash.slice(2, 18),
    config,
    policy: structuredClone(policy),
    status,
    score: { ...s.score },
    stats: { ...s.stats },
    actions: encoded,
    decisions,
    events: s.events,
    replayHash: hash,
  };
}

export interface EndlessResult {
  floors: MatchResult[];
  floorsCleared: number;
  totalScore: number;
}

/** Endless Grid: floors get harder, HP carries over, ends at the first failure. */
export function runEndless(seed: string, policy: Policy, startLevel = 1, maxFloors = 50): EndlessResult {
  const floors: MatchResult[] = [];
  let hp: number | undefined;
  for (let f = 0; f < maxFloors; f++) {
    const config = buildConfig({ mode: "endless", seed: `${seed}:floor${f}`, level: startLevel + f });
    const r = runMatch(config, policy, { hp });
    floors.push(r);
    if (r.status !== "escaped") break;
    hp = (hp ?? config.hp) - r.stats.damageTaken;
  }
  const floorsCleared = floors.filter((r) => r.status === "escaped").length;
  return { floors, floorsCleared, totalScore: floors.reduce((a, r) => a + r.score.total, 0) };
}
