export interface Vec {
  x: number;
  y: number;
}

export type Action =
  | "MOVE_UP"
  | "MOVE_DOWN"
  | "MOVE_LEFT"
  | "MOVE_RIGHT"
  | "USE_BOMB"
  | "WAIT"
  | "ESCAPE";

export const ACTIONS: readonly Action[] = [
  "MOVE_UP",
  "MOVE_DOWN",
  "MOVE_LEFT",
  "MOVE_RIGHT",
  "USE_BOMB",
  "WAIT",
  "ESCAPE",
];

export type Mode = "daily" | "survival" | "special" | "endless" | "training";

export type MatchStatus = "running" | "escaped" | "destroyed" | "timeout";
export type DeathCause = "enemy" | "collapse" | null;

export type EnemyKind = "seeker" | "sentinel";

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pos: Vec;
  spawn: Vec;
  stunnedUntil: number;
  /** Sentinel patrol route (ping-pong). Empty for seekers. */
  route: Vec[];
  routeIndex: number;
  routeDir: 1 | -1;
  /** Seeker: last place it saw NOVA (null = never). */
  lastSeen: Vec | null;
}

export interface AgentState {
  pos: Vec;
  hp: number;
  bombs: number;
  collected: number;
  damageTaken: number;
  invulnerableUntil: number;
  /** Most recent passable Echo Trail tiles, oldest first (max 2). */
  trail: Vec[];
  /** Last few positions, newest last (for oscillation detection). */
  recent: Vec[];
}

export interface PendingCollapse {
  cells: Vec[];
  axis: "row" | "col";
  announcedAt: number;
  at: number;
}

export interface ScoreBreakdown {
  crystals: number;
  bonuses: number;
  escape: number;
  stuns: number;
  noDamage: number;
  speed: number;
  total: number;
}

export interface MatchStats {
  ticks: number;
  crystals: number;
  bonuses: number;
  damageTaken: number;
  bombsUsed: number;
  bombsWasted: number;
  enemiesStunned: number;
  trailCleared: number;
  deadEnds: number;
  oscillations: number;
  blockedMoves: number;
  waits: number;
  distance: number;
  collapsesSurvived: number;
  deathCause: DeathCause;
}

export type GameEvent =
  | { t: number; type: "crystal"; pos: Vec; remaining: number }
  | { t: number; type: "bonus"; pos: Vec }
  | { t: number; type: "exit_open" }
  | { t: number; type: "trail_crystallised"; pos: Vec }
  | { t: number; type: "bomb"; pos: Vec; cleared: number; stunned: number[] }
  | { t: number; type: "hit"; enemyId: number; hp: number }
  | { t: number; type: "collapse_warning"; cells: Vec[]; at: number }
  | { t: number; type: "collapse"; cells: Vec[] }
  | { t: number; type: "collapse_aborted" }
  | { t: number; type: "invalid_action"; action: Action }
  | { t: number; type: "escaped" }
  | { t: number; type: "destroyed"; cause: Exclude<DeathCause, null> }
  | { t: number; type: "timeout" };
