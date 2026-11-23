import { useSyncExternalStore } from "react";
import {
  type Experience,
  type LearningReport,
  type MatchAnalysis,
  type MatchConfig,
  type MatchResult,
  type Mode,
  type Personality,
  type Policy,
  type PolicyHistory,
  activePolicy,
  applyCoaching,
  newPolicyHistory,
  rollback,
} from "@aftermaze/engine";

/** What we keep of a finished match. Replays are rebuilt from config + actions. */
export interface MatchRecord {
  id: string;
  at: number;
  mode: Mode;
  config: MatchConfig;
  policy: Policy;
  status: MatchResult["status"];
  score: MatchResult["score"];
  stats: MatchResult["stats"];
  actions: string;
  replayHash: string;
  hp?: number;
  /** Endless Grid run this floor belongs to. */
  runId?: string;
  floor?: number;
  learning: Pick<LearningReport, "explanation" | "adopted" | "baseline"> & { tested: number } | null;
  newBest: boolean;
}

export interface Agent {
  name: string;
  personality: Personality;
  createdAt: number;
}

export interface SaveData {
  v: 1;
  agent: Agent | null;
  policies: PolicyHistory | null;
  memory: Experience[];
  analyses: MatchAnalysis[];
  matches: MatchRecord[];
  survivalLevel: number;
  bests: Partial<Record<Mode, number>>;
  endlessBestFloors: number;
}

const KEY = "aftermaze.save.v1";
const MAX_MATCHES = 60;

const empty = (): SaveData => ({
  v: 1,
  agent: null,
  policies: null,
  memory: [],
  analyses: [],
  matches: [],
  survivalLevel: 1,
  bests: {},
  endlessBestFloors: 0,
});

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const d = JSON.parse(raw) as SaveData;
    return d?.v === 1 ? { ...empty(), ...d } : empty();
  } catch {
    return empty();
  }
}

let state: SaveData = load();
const listeners = new Set<() => void>();

function set(next: SaveData) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: keep playing in memory.
  }
  listeners.forEach((l) => l());
}

export function useSave(): SaveData {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export const getSave = () => state;

export function createAgent(name: string, personality: Personality) {
  set({
    ...empty(),
    agent: { name: name.trim().slice(0, 24) || "NOVA", personality, createdAt: Date.now() },
    policies: newPolicyHistory(personality),
  });
}

export function resetAll() {
  set(empty());
}

export function currentPolicy(): Policy | null {
  return state.policies ? activePolicy(state.policies) : null;
}

export function coach(text: string) {
  if (!state.policies) return null;
  const out = applyCoaching(state.policies, text);
  if (out.version) set({ ...state, policies: out.history });
  return out;
}

export function rollbackTo(version: number) {
  if (!state.policies) return;
  set({ ...state, policies: rollback(state.policies, version) });
}

export function recordMatch(
  result: MatchResult,
  learned: { history: PolicyHistory; memory: Experience[]; report: LearningReport } | null,
  extra: { hp?: number; runId?: string; floor?: number } = {},
): MatchRecord {
  const mode = result.config.mode;
  const prevBest = state.bests[mode] ?? 0;
  const newBest = result.score.total > prevBest;
  const rec: MatchRecord = {
    id: `${result.id}-${Date.now().toString(36)}`,
    at: Date.now(),
    mode,
    config: result.config,
    policy: result.policy,
    status: result.status,
    score: result.score,
    stats: result.stats,
    actions: result.actions,
    replayHash: result.replayHash,
    ...extra,
    learning: learned
      ? {
          explanation: learned.report.explanation,
          adopted: learned.report.adopted,
          baseline: learned.report.baseline,
          tested: learned.report.tested.length,
        }
      : null,
    newBest,
  };
  let survivalLevel = state.survivalLevel;
  if (mode === "survival" && result.status === "escaped") survivalLevel += 1;
  set({
    ...state,
    policies: learned?.history ?? state.policies,
    memory: learned?.memory ?? state.memory,
    analyses: learned ? [...state.analyses, learned.report.analysis].slice(-20) : state.analyses,
    matches: [rec, ...state.matches].slice(0, MAX_MATCHES),
    survivalLevel,
    bests: newBest ? { ...state.bests, [mode]: result.score.total } : state.bests,
  });
  return rec;
}

export function recordEndless(floorsCleared: number) {
  if (floorsCleared > state.endlessBestFloors) set({ ...state, endlessBestFloors: floorsCleared });
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
