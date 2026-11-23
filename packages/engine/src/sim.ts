import type { MatchConfig } from "./config";
import { COLLAPSED, FLOOR, MOVE_DELTA, TRAIL, chebyshev, idx, inBounds, neighbours, same } from "./grid";
import { generateMaze } from "./maze";
import { bfs } from "./pathfinding";
import { Rng, seedFromString } from "./rng";
import type {
  Action,
  AgentState,
  Enemy,
  GameEvent,
  MatchStats,
  MatchStatus,
  PendingCollapse,
  ScoreBreakdown,
  Vec,
} from "./types";

export const POINTS = {
  crystal: 100,
  bonus: 25,
  escape: 250,
  stun: 50,
  noDamage: 200,
  speedMax: 150,
} as const;

export interface GameState {
  config: MatchConfig;
  tick: number;
  width: number;
  height: number;
  grid: number[];
  /** Crystallised trail tiles and the tick they dissolve. */
  trailExpiry: { i: number; until: number }[];
  start: Vec;
  exit: Vec;
  agent: AgentState;
  crystals: Vec[];
  bonuses: Vec[];
  enemies: Enemy[];
  pendingCollapse: PendingCollapse | null;
  nextCollapseAt: number;
  status: MatchStatus;
  score: ScoreBreakdown;
  stats: MatchStats;
  rng: number;
  events: GameEvent[];
}

export interface CreateOptions {
  /** Endless Grid carries HP between floors. */
  hp?: number;
}

export function createGame(config: MatchConfig, opts: CreateOptions = {}): GameState {
  const rng = new Rng(seedFromString(`${config.engineVersion}|${config.seed}|${config.level}|${config.special ?? ""}`));
  const maze = generateMaze(config, rng);
  let id = 0;
  const enemies: Enemy[] = [
    ...maze.seekerSpawns.map((p) => ({
      id: id++,
      kind: "seeker" as const,
      pos: { ...p },
      spawn: { ...p },
      stunnedUntil: 0,
      route: [],
      routeIndex: 0,
      routeDir: 1 as const,
      lastSeen: null,
    })),
    ...maze.sentinelRoutes.map((r) => ({
      id: id++,
      kind: "sentinel" as const,
      pos: { ...r[0] },
      spawn: { ...r[0] },
      stunnedUntil: 0,
      route: r.map((v) => ({ ...v })),
      routeIndex: 0,
      routeDir: 1 as const,
      lastSeen: null,
    })),
  ];

  return {
    config,
    tick: 0,
    width: maze.width,
    height: maze.height,
    grid: maze.grid,
    trailExpiry: [],
    start: maze.start,
    exit: maze.exit,
    agent: {
      pos: { ...maze.start },
      hp: opts.hp ?? config.hp,
      bombs: config.bombs,
      collected: 0,
      damageTaken: 0,
      invulnerableUntil: 0,
      trail: [],
      recent: [{ ...maze.start }],
    },
    crystals: maze.crystals,
    bonuses: maze.bonuses,
    enemies,
    pendingCollapse: null,
    nextCollapseAt: config.collapseEvery,
    status: "running",
    score: { crystals: 0, bonuses: 0, escape: 0, stuns: 0, noDamage: 0, speed: 0, total: 0 },
    stats: {
      ticks: 0,
      crystals: 0,
      bonuses: 0,
      damageTaken: 0,
      bombsUsed: 0,
      bombsWasted: 0,
      enemiesStunned: 0,
      trailCleared: 0,
      deadEnds: 0,
      oscillations: 0,
      blockedMoves: 0,
      waits: 0,
      distance: 0,
      collapsesSurvived: 0,
      deathCause: null,
    },
    rng: rng.state,
    events: [],
  };
}

export const cloneState = (s: GameState): GameState => structuredClone(s);

/** Cells the agent can walk on right now. */
export const isWalkable = (s: GameState, i: number) => s.grid[i] === FLOOR;

/**
 * Can the agent still reach every remaining crystal and the exit?
 * Crystallised trail counts as passable because it dissolves; walls and collapses don't.
 */
export function isSolvable(s: GameState, from: Vec, extraBlocked: Set<number> = new Set()): boolean {
  const { width: w, height: h } = s;
  const passable = (i: number) => (s.grid[i] === FLOOR || s.grid[i] === TRAIL) && !extraBlocked.has(i);
  const fromI = idx(w, from.x, from.y);
  if (extraBlocked.has(fromI)) return false;
  const d = bfs(w, h, [fromI], passable);
  const targets = [...s.crystals, s.exit];
  return targets.every((t) => d[idx(w, t.x, t.y)] >= 0);
}

const emit = (s: GameState, e: GameEvent) => s.events.push(e);

function finish(s: GameState, status: Exclude<MatchStatus, "running">) {
  s.status = status;
  s.stats.ticks = s.tick;
  s.stats.crystals = s.agent.collected;
  s.stats.damageTaken = s.agent.damageTaken;
  const sc = s.score;
  if (status === "escaped") {
    sc.escape = POINTS.escape;
    sc.noDamage = s.agent.damageTaken === 0 ? POINTS.noDamage : 0;
    sc.speed = Math.floor((POINTS.speedMax * (s.config.maxTicks - s.tick)) / s.config.maxTicks);
  }
  sc.total = sc.crystals + sc.bonuses + sc.escape + sc.stuns + sc.noDamage + sc.speed;
}

function damageAgent(s: GameState, enemy: Enemy) {
  const a = s.agent;
  if (s.tick < a.invulnerableUntil) return;
  a.hp -= 1;
  a.damageTaken += 1;
  a.invulnerableUntil = s.tick + 4;
  enemy.stunnedUntil = Math.max(enemy.stunnedUntil, s.tick + 10); // grace period so NOVA can get away
  emit(s, { t: s.tick, type: "hit", enemyId: enemy.id, hp: a.hp });
  if (a.hp <= 0) {
    s.stats.deathCause = "enemy";
    emit(s, { t: s.tick, type: "destroyed", cause: "enemy" });
    finish(s, "destroyed");
  }
}

function checkCollisions(s: GameState, agentPrev: Vec, enemyPrev: Map<number, Vec>) {
  for (const e of s.enemies) {
    if (s.status !== "running") return;
    if (s.tick < e.stunnedUntil) continue;
    const prev = enemyPrev.get(e.id);
    const swapped = prev && same(prev, s.agent.pos) && same(e.pos, agentPrev);
    if (same(e.pos, s.agent.pos) || swapped) damageAgent(s, e);
  }
}

function pushTrail(s: GameState, left: Vec) {
  const a = s.agent;
  const { width: w } = s;
  a.trail = a.trail.filter((t) => !same(t, left));
  a.trail.push({ ...left });
  while (a.trail.length > 2) {
    const old = a.trail.shift()!;
    const i = idx(w, old.x, old.y);
    const occupied = same(old, a.pos) || s.enemies.some((e) => same(e.pos, old));
    if (s.grid[i] === FLOOR && !occupied) {
      s.grid[i] = TRAIL;
      s.trailExpiry.push({ i, until: s.tick + s.config.trailLifetime });
      emit(s, { t: s.tick, type: "trail_crystallised", pos: old });
    }
  }
}

function moveAgent(s: GameState, action: Action) {
  const a = s.agent;
  const d = MOVE_DELTA[action]!;
  const nx = a.pos.x + d.x;
  const ny = a.pos.y + d.y;
  if (!inBounds(s.width, s.height, nx, ny) || s.grid[idx(s.width, nx, ny)] !== FLOOR) {
    s.stats.blockedMoves++;
    emit(s, { t: s.tick, type: "invalid_action", action });
    return;
  }
  const left = { ...a.pos };
  a.pos = { x: nx, y: ny };
  s.stats.distance++;
  pushTrail(s, left);

  // Oscillation: back where we were two moves ago.
  const r = a.recent;
  if (r.length >= 2 && same(r[r.length - 2], a.pos)) s.stats.oscillations++;
  r.push({ ...a.pos });
  if (r.length > 4) r.shift();

  const ci = s.crystals.findIndex((c) => same(c, a.pos));
  if (ci >= 0) {
    s.crystals.splice(ci, 1);
    a.collected++;
    s.score.crystals += POINTS.crystal;
    emit(s, { t: s.tick, type: "crystal", pos: { ...a.pos }, remaining: s.crystals.length });
    if (!s.crystals.length) emit(s, { t: s.tick, type: "exit_open" });
  }
  const bi = s.bonuses.findIndex((b) => same(b, a.pos));
  if (bi >= 0) {
    s.bonuses.splice(bi, 1);
    s.stats.bonuses++;
    s.score.bonuses += POINTS.bonus;
    emit(s, { t: s.tick, type: "bonus", pos: { ...a.pos } });
  }

  // Dead end: only one way out and nothing worth being here for.
  const openN = neighbours(s.width, s.height, idx(s.width, nx, ny)).filter((i) => s.grid[i] === FLOOR).length;
  if (openN <= 1 && ci < 0 && bi < 0 && !same(a.pos, s.exit)) s.stats.deadEnds++;
}

function useBomb(s: GameState) {
  const a = s.agent;
  if (a.bombs <= 0) {
    emit(s, { t: s.tick, type: "invalid_action", action: "USE_BOMB" });
    return;
  }
  a.bombs--;
  s.stats.bombsUsed++;
  const R = s.config.bombRadius;
  let cleared = 0;
  const { width: w, height: h } = s;
  for (let y = a.pos.y - R; y <= a.pos.y + R; y++) {
    for (let x = a.pos.x - R; x <= a.pos.x + R; x++) {
      if (!inBounds(w, h, x, y)) continue;
      const i = idx(w, x, y);
      if (s.grid[i] === TRAIL) {
        s.grid[i] = FLOOR;
        cleared++;
      }
    }
  }
  if (cleared) s.trailExpiry = s.trailExpiry.filter((t) => s.grid[t.i] === TRAIL);
  const stunned: number[] = [];
  for (const e of s.enemies) {
    if (chebyshev(e.pos, a.pos) <= R) {
      e.stunnedUntil = s.tick + s.config.stunTicks;
      stunned.push(e.id);
    }
  }
  s.stats.trailCleared += cleared;
  s.stats.enemiesStunned += stunned.length;
  s.score.stuns += POINTS.stun * stunned.length;
  if (!cleared && !stunned.length) s.stats.bombsWasted++;
  emit(s, { t: s.tick, type: "bomb", pos: { ...a.pos }, cleared, stunned });
}

/** Moves allowed this tick for a speed expressed as moves per 4 ticks. */
const movesThisTick = (tick: number, speed: number) =>
  Math.floor(((tick + 1) * speed) / 4) - Math.floor((tick * speed) / 4);

function moveEnemies(s: GameState) {
  const { width: w, height: h } = s;
  const walk = (i: number) => s.grid[i] === FLOOR;
  const agentI = idx(w, s.agent.pos.x, s.agent.pos.y);
  let toAgent: Int32Array | null = null;

  for (const e of s.enemies) {
    if (s.tick < e.stunnedUntil) continue;
    if (e.kind === "seeker") {
      toAgent ??= bfs(w, h, [agentI], walk);
      const here = idx(w, e.pos.x, e.pos.y);
      const sees = toAgent[here] >= 0 && toAgent[here] <= s.config.seekerSight;
      if (sees) e.lastSeen = { ...s.agent.pos };
      // Full speed while it can see NOVA; otherwise creep (1 move per 4 ticks).
      if (!movesThisTick(s.tick, sees ? s.config.seekerSpeed : 1)) continue;
      let field = toAgent;
      if (!sees && e.lastSeen && !same(e.lastSeen, e.pos)) field = bfs(w, h, [idx(w, e.lastSeen.x, e.lastSeen.y)], walk);
      else if (!sees && e.lastSeen) e.lastSeen = null; // reached the spot: resume tracking by sound
      let best = -1;
      let bestD = field[here] >= 0 ? field[here] : Infinity;
      for (const n of neighbours(w, h, here)) {
        if (!walk(n) || field[n] < 0) continue;
        if (field[n] < bestD) {
          bestD = field[n];
          best = n;
        }
      }
      if (best >= 0) e.pos = { x: best % w, y: Math.floor(best / w) };
    } else {
      if (!movesThisTick(s.tick, s.config.sentinelSpeed) || e.route.length < 2) continue;
      for (let attempt = 0; attempt < 2; attempt++) {
        let ni = e.routeIndex + e.routeDir;
        if (ni < 0 || ni >= e.route.length) {
          e.routeDir = (-e.routeDir) as 1 | -1;
          ni = e.routeIndex + e.routeDir;
        }
        const next = e.route[ni];
        if (walk(idx(w, next.x, next.y))) {
          e.routeIndex = ni;
          e.pos = { ...next };
          break;
        }
        e.routeDir = (-e.routeDir) as 1 | -1; // blocked by trail or collapse: turn around
      }
    }
  }
}

function expireTrail(s: GameState) {
  if (!s.trailExpiry.length) return;
  const keep: typeof s.trailExpiry = [];
  for (const t of s.trailExpiry) {
    if (t.until <= s.tick) {
      if (s.grid[t.i] === TRAIL) s.grid[t.i] = FLOOR;
    } else keep.push(t);
  }
  s.trailExpiry = keep;
}

/** Picks a corridor segment to close that keeps the maze solvable, or null. */
export function chooseCollapse(s: GameState, rng: Rng): PendingCollapse | null {
  const { width: w, height: h, config } = s;
  const openCell = (x: number, y: number) => {
    const t = s.grid[idx(w, x, y)];
    return t === FLOOR || t === TRAIL;
  };
  const protectedCells = new Set<number>(
    [...s.crystals, s.exit, ...s.bonuses].map((v) => idx(w, v.x, v.y)),
  );
  const a = s.agent.pos;

  const segments: { cells: Vec[]; axis: "row" | "col" }[] = [];
  const scan = (axis: "row" | "col") => {
    const outer = axis === "row" ? h : w;
    const inner = axis === "row" ? w : h;
    for (let o = 1; o < outer - 1; o++) {
      let run: Vec[] = [];
      const flush = () => {
        if (run.length >= 2) {
          const len = Math.min(config.collapseLength, run.length);
          const offset = rng.int(run.length - len + 1);
          segments.push({ cells: run.slice(offset, offset + len), axis });
        }
        run = [];
      };
      for (let k = 0; k < inner; k++) {
        const x = axis === "row" ? k : o;
        const y = axis === "row" ? o : k;
        if (openCell(x, y)) run.push({ x, y });
        else flush();
      }
      flush();
    }
  };
  scan("row");
  scan("col");

  const valid = segments.filter(({ cells }) => {
    if (cells.some((c) => protectedCells.has(idx(w, c.x, c.y)) || chebyshev(c, a) <= 1)) return false;
    return isSolvable(s, a, new Set(cells.map((c) => idx(w, c.x, c.y))));
  });
  if (!valid.length) return null;
  const pick = valid[rng.int(valid.length)];
  return { ...pick, announcedAt: s.tick, at: s.tick + config.collapseWarning };
}

function updateCollapse(s: GameState) {
  const { width: w } = s;
  const rng = new Rng(s.rng);
  const p = s.pendingCollapse;

  if (p && s.tick >= p.at) {
    const blocked = new Set(p.cells.map((c) => idx(w, c.x, c.y)));
    const agentOnIt = blocked.has(idx(w, s.agent.pos.x, s.agent.pos.y));
    // Re-check at the moment of closing. If NOVA is standing on it, it closes anyway.
    if (!agentOnIt && !isSolvable(s, s.agent.pos, blocked)) {
      emit(s, { t: s.tick, type: "collapse_aborted" });
    } else {
      for (const i of blocked) s.grid[i] = COLLAPSED;
      s.trailExpiry = s.trailExpiry.filter((t) => !blocked.has(t.i));
      s.agent.trail = s.agent.trail.filter((t) => !blocked.has(idx(w, t.x, t.y)));
      for (const e of s.enemies) {
        if (blocked.has(idx(w, e.pos.x, e.pos.y))) {
          e.pos = { ...e.spawn };
          e.routeIndex = 0;
          e.routeDir = 1;
        }
      }
      emit(s, { t: s.tick, type: "collapse", cells: p.cells });
      if (agentOnIt) {
        s.stats.deathCause = "collapse";
        emit(s, { t: s.tick, type: "destroyed", cause: "collapse" });
        finish(s, "destroyed");
      } else s.stats.collapsesSurvived++;
    }
    s.pendingCollapse = null;
    s.nextCollapseAt = s.tick + s.config.collapseEvery;
  } else if (!p && s.tick >= s.nextCollapseAt) {
    const next = chooseCollapse(s, rng);
    if (next) {
      s.pendingCollapse = next;
      emit(s, { t: s.tick, type: "collapse_warning", cells: next.cells, at: next.at });
    } else s.nextCollapseAt = s.tick + 20;
  }
  s.rng = rng.state;
}

/** Advances the match by one tick. Mutates and returns `s`. */
export function step(s: GameState, action: Action): GameState {
  if (s.status !== "running") return s;
  const agentPrev = { ...s.agent.pos };

  switch (action) {
    case "MOVE_UP":
    case "MOVE_DOWN":
    case "MOVE_LEFT":
    case "MOVE_RIGHT":
      moveAgent(s, action);
      break;
    case "USE_BOMB":
      useBomb(s);
      break;
    case "ESCAPE":
      if (same(s.agent.pos, s.exit) && !s.crystals.length) {
        emit(s, { t: s.tick, type: "escaped" });
        finish(s, "escaped");
        return s;
      }
      emit(s, { t: s.tick, type: "invalid_action", action });
      break;
    case "WAIT":
      s.stats.waits++;
      break;
  }

  // Agent walked into an enemy.
  checkCollisions(s, agentPrev, new Map());
  if (s.status !== "running") return s;

  const enemyPrev = new Map(s.enemies.map((e) => [e.id, { ...e.pos }]));
  moveEnemies(s);
  checkCollisions(s, agentPrev, enemyPrev);
  if (s.status !== "running") return s;

  expireTrail(s);
  updateCollapse(s);
  if (s.status !== "running") return s;

  const sc = s.score;
  sc.total = sc.crystals + sc.bonuses + sc.stuns; // live score; escape bonuses are added at the end
  s.tick++;
  if (s.tick >= s.config.maxTicks) {
    emit(s, { t: s.tick, type: "timeout" });
    finish(s, "timeout");
  }
  return s;
}

