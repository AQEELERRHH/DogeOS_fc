import type { Mode } from "./types";

export const ENGINE_VERSION = "0.1.0";

export interface MatchConfig {
  engineVersion: string;
  mode: Mode;
  seed: string;
  level: number;
  /** Special maze key, if any. */
  special: string | null;
  width: number;
  height: number;
  seekers: number;
  sentinels: number;
  /** Seeker moves per 4 ticks (agent moves 4 per 4 ticks). */
  seekerSpeed: number;
  /** Seekers chase at full speed within this path distance; beyond it they creep to NOVA's last known spot. */
  seekerSight: number;
  /** Sentinel moves per 4 ticks. */
  sentinelSpeed: number;
  /** Ticks between the end of one collapse and the next warning. */
  collapseEvery: number;
  /** Ticks between the warning and the collapse. */
  collapseWarning: number;
  collapseLength: number;
  maxTicks: number;
  hp: number;
  bombs: number;
  bombRadius: number;
  stunTicks: number;
  /** How long crystallised Echo Trail lasts before dissolving. */
  trailLifetime: number;
  bonusItems: number;
  /** % of dead ends opened into loops (0–100). */
  braid: number;
}

export interface SpecialMaze {
  key: string;
  name: string;
  description: string;
  apply: (c: MatchConfig) => void;
}

export const SPECIAL_MAZES: Record<string, SpecialMaze> = {
  "twin-hunters": {
    key: "twin-hunters",
    name: "Twin Hunters",
    description: "Two extra Seekers hunt NOVA from the first tick.",
    apply: (c) => {
      c.seekers += 2;
    },
  },
  "unstable-core": {
    key: "unstable-core",
    name: "Unstable Core",
    description: "Collapses come twice as often with shorter warnings.",
    apply: (c) => {
      c.collapseEvery = Math.max(30, Math.floor(c.collapseEvery / 2));
      c.collapseWarning = Math.max(10, c.collapseWarning - 6);
    },
  },
  "long-echo": {
    key: "long-echo",
    name: "Long Echo",
    description: "The Echo Trail stays crystallised three times longer.",
    apply: (c) => {
      c.trailLifetime *= 3;
    },
  },
  "bare-hands": {
    key: "bare-hands",
    name: "Bare Hands",
    description: "No pulse bombs. Survive on pathfinding alone.",
    apply: (c) => {
      c.bombs = 0;
    },
  },
};

/** Difficulty curve shared by Survival, Endless, Training and Daily. */
export function levelParams(level: number) {
  const L = Math.max(1, Math.floor(level));
  return {
    width: 19 + 2 * Math.min(6, Math.floor((L - 1) / 2)),
    height: 13 + 2 * Math.min(4, Math.floor((L - 1) / 2)),
    seekers: Math.min(3, 1 + Math.floor((L - 1) / 4)),
    sentinels: Math.min(4, 1 + Math.floor(L / 2)),
    seekerSpeed: L >= 7 ? 3 : 2,
    seekerSight: 7 + Math.min(8, Math.floor(L / 2)),
    collapseEvery: Math.max(50, 130 - L * 8),
    braid: Math.max(30, 70 - L * 4),
  };
}

export interface BuildConfigInput {
  mode: Mode;
  seed: string;
  level?: number;
  special?: string | null;
}

export function buildConfig({ mode, seed, level = 1, special = null }: BuildConfigInput): MatchConfig {
  const p = levelParams(level);
  const c: MatchConfig = {
    engineVersion: ENGINE_VERSION,
    mode,
    seed,
    level,
    special,
    width: p.width,
    height: p.height,
    seekers: p.seekers,
    sentinels: p.sentinels,
    seekerSpeed: p.seekerSpeed,
    seekerSight: p.seekerSight,
    sentinelSpeed: 2,
    collapseEvery: p.collapseEvery,
    collapseWarning: 24,
    collapseLength: 4,
    maxTicks: 600,
    hp: 3,
    bombs: 2,
    bombRadius: 2,
    stunTicks: 12,
    trailLifetime: 30,
    bonusItems: 3,
    braid: p.braid,
  };
  if (special) {
    const s = SPECIAL_MAZES[special];
    if (!s) throw new Error(`Unknown special maze: ${special}`);
    s.apply(c);
  }
  return c;
}

/** Same seed for every player on a given UTC day. `date` is YYYY-MM-DD. */
export function dailyConfig(date: string): MatchConfig {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
  return buildConfig({ mode: "daily", seed: `daily:${date}`, level: 3 });
}
