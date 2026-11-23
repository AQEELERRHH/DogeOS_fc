import { FLOOR, TRAIL, DIRS, chebyshev, idx, inBounds, neighbours, same } from "../grid";
import { astar, bfs, floodCount } from "../pathfinding";
import type { GameState } from "../sim";
import type { Action, Vec } from "../types";
import type { Policy } from "./policy";

export type Intent = "escape" | "crystal" | "exit" | "bonus" | "bomb" | "flee" | "unstick" | "wait";

export interface Decision {
  action: Action;
  intent: Intent;
  /** Human-readable explanation shown in the replay / workshop. */
  reason: string;
  target: Vec | null;
}

const STEP = 10;
const fmt = (v: Vec) => `(${v.x},${v.y})`;

function actionTowards(from: Vec, to: Vec): Action {
  for (const d of DIRS) if (from.x + d.dx === to.x && from.y + d.dy === to.y) return d.action;
  return "WAIT";
}

/** Everything the brain derives from the observation once per tick. */
interface View {
  s: GameState;
  p: Policy;
  w: number;
  h: number;
  me: Vec;
  meI: number;
  /** Distance from the nearest active enemy to every cell (-1 = no active enemy can reach). */
  threat: Int32Array;
  activeEnemies: GameState["enemies"];
  collapseCells: Set<number>;
  sentinelCells: Set<number>;
  /** Where each active sentinel will be over the next few ticks. */
  sentinelAhead: Set<number>;
  seekerNear: boolean;
  /** An active Seeker can currently see NOVA. */
  hunted: boolean;
  /** Tiles inside dead-end branches given the current walls and trail. */
  deadEnds: Uint8Array;
  invulnerable: boolean;
  /** When true, tiles next to an active enemy are treated as blocked. */
  hard: boolean;
}

function buildView(s: GameState, p: Policy): View {
  const { width: w, height: h } = s;
  const me = s.agent.pos;
  const meI = idx(w, me.x, me.y);
  const activeEnemies = s.enemies.filter((e) => s.tick >= e.stunnedUntil);
  const walk = (i: number) => s.grid[i] === FLOOR;
  const threat = activeEnemies.length
    ? bfs(w, h, activeEnemies.map((e) => idx(w, e.pos.x, e.pos.y)), walk)
    : new Int32Array(w * h).fill(-1);
  const collapseCells = new Set((s.pendingCollapse?.cells ?? []).map((c) => idx(w, c.x, c.y)));
  const sentinelCells = new Set<number>();
  for (const e of activeEnemies) if (e.kind === "sentinel") for (const r of e.route) sentinelCells.add(idx(w, r.x, r.y));
  const seekerNear = activeEnemies.some((e) => e.kind === "seeker" && chebyshev(e.pos, me) <= 6);
  const sentinelAhead = new Set<number>();
  for (const e of activeEnemies) {
    if (e.kind !== "sentinel" || e.route.length < 2) continue;
    let ri = e.routeIndex;
    let dir = e.routeDir;
    for (let k = 0; k < 4; k++) {
      if (ri + dir < 0 || ri + dir >= e.route.length) dir = (-dir) as 1 | -1;
      ri += dir;
      sentinelAhead.add(idx(w, e.route[ri].x, e.route[ri].y));
    }
  }
  const invulnerable = s.tick < s.agent.invulnerableUntil;
  const seekerThreat = activeEnemies.some((e) => e.kind === "seeker")
    ? bfs(w, h, activeEnemies.filter((e) => e.kind === "seeker").map((e) => idx(w, e.pos.x, e.pos.y)), walk)[meI]
    : -1;
  const hunted = seekerThreat >= 0 && seekerThreat <= s.config.seekerSight + 2;
  return {
    s, p, w, h, me, meI, threat, activeEnemies, collapseCells, sentinelCells, sentinelAhead, seekerNear,
    hunted, deadEnds: deadEndCells(s), invulnerable, hard: true,
  };
}

/** Leaf-pruning: repeatedly strip tiles with ≤1 open neighbour. What gets stripped is a dead-end branch. */
export function deadEndCells(s: GameState): Uint8Array {
  const { width: w, height: h } = s;
  const out = new Uint8Array(w * h);
  const deg = new Int8Array(w * h);
  const queue: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (s.grid[i] !== FLOOR) continue;
    deg[i] = neighbours(w, h, i).filter((n) => s.grid[n] === FLOOR).length as number;
    if (deg[i] <= 1) queue.push(i);
  }
  while (queue.length) {
    const i = queue.pop()!;
    if (out[i]) continue;
    out[i] = 1;
    for (const n of neighbours(w, h, i)) {
      if (s.grid[n] !== FLOOR || out[n]) continue;
      if (--deg[n] <= 1) queue.push(n);
    }
  }
  return out;
}

/** Cost of stepping into a cell, shaped by the agent's weights. */
function stepCost(v: View, i: number): number {
  const { s, p } = v;
  if (s.grid[i] !== FLOOR) return Infinity;
  const W = p.weights;
  let c = STEP;
  if (v.collapseCells.has(i)) c += 400;
  const d = v.threat[i];
  const radius = 2 + Math.floor(W.survival / 20); // survivors give enemies a wider berth
  if (d >= 0 && d <= radius) c += (radius + 1 - d) * (3 + Math.floor(W.survival / 5));
  if (d >= 0 && d <= 1) {
    if (v.hard && !v.invulnerable) return Infinity;
    c += 20 + W.survival;
  }
  if (v.sentinelAhead.has(i)) c += 15 + Math.floor(W.survival / 2);
  // Dead-end pockets are traps while a Seeker is hunting NOVA.
  if (v.hunted && v.deadEnds[i]) c += 8 + Math.floor(W.survival / 3) + (p.prefs.corridorCaution ? 20 : 0);
  if (v.sentinelCells.has(i)) c += Math.floor(W.survival / 5);
  if (p.prefs.corridorCaution && v.seekerNear) {
    const open = neighbours(v.w, v.h, i).filter((n) => s.grid[n] === FLOOR).length;
    if (open <= 2) c += 25;
  }
  return c;
}

interface Plan {
  goal: Vec;
  kind: "crystal" | "exit" | "bonus";
  path: Vec[];
  cost: number;
  value: number;
}

function planGoals(v: View): Plan[] {
  const { s, p } = v;
  const W = p.weights;
  const cost = (i: number) => stepCost(v, i);
  const plans: Plan[] = [];

  const mains = s.crystals.length ? s.crystals.map((g) => ({ g, kind: "crystal" as const })) : [{ g: s.exit, kind: "exit" as const }];
  for (const { g, kind } of mains) {
    const r = astar(v.w, v.h, v.me, g, cost, STEP);
    if (!r) continue;
    // Efficiency looks one leg ahead: prefer crystals that leave a short route to the next target.
    let nextLeg = 0;
    if (kind === "crystal") {
      const rest = [...s.crystals.filter((c) => !same(c, g))];
      const targets = rest.length ? rest : [s.exit];
      nextLeg = Math.min(...targets.map((t) => (Math.abs(t.x - g.x) + Math.abs(t.y - g.y)) * STEP));
    }
    const value = r.cost + Math.floor((nextLeg * W.efficiency) / 100);
    plans.push({ goal: g, kind, path: r.path, cost: r.cost, value });
  }

  for (const b of s.bonuses) {
    const r = astar(v.w, v.h, v.me, b, cost, STEP);
    if (!r) continue;
    // Explorers detour for bonuses; speedrunners mostly don't.
    const value = Math.floor((r.cost * 3 * (110 - W.exploration)) / 100) + 4 * W.efficiency;
    plans.push({ goal: b, kind: "bonus", path: r.path, cost: r.cost, value });
  }

  return plans.sort((a, b) => a.value - b.value || a.goal.y - b.goal.y || a.goal.x - b.goal.x);
}

/** How much room is left after stepping to `next` (accounting for the tile that will crystallise). */
function roomAfter(v: View, next: Vec): number {
  const { s } = v;
  const willHarden = s.agent.trail.length >= 2 ? s.agent.trail[0] : null;
  const hardI = willHarden ? idx(v.w, willHarden.x, willHarden.y) : -1;
  const nextI = idx(v.w, next.x, next.y);
  return floodCount(v.w, v.h, nextI, (i) => i === v.meI || (s.grid[i] === FLOOR && i !== hardI), 12);
}

function bombWouldFreePath(v: View, goal: Vec): boolean {
  const { s } = v;
  const R = s.config.bombRadius;
  const cleared = new Set<number>();
  for (let y = v.me.y - R; y <= v.me.y + R; y++)
    for (let x = v.me.x - R; x <= v.me.x + R; x++)
      if (inBounds(v.w, v.h, x, y) && s.grid[idx(v.w, x, y)] === TRAIL) cleared.add(idx(v.w, x, y));
  if (!cleared.size) return false;
  const r = astar(v.w, v.h, v.me, goal, (i) => (s.grid[i] === FLOOR || cleared.has(i) ? STEP : Infinity), STEP);
  return r !== null;
}

/**
 * Two-step lookahead escape. Scores each reachable cell in 1–2 moves by how far it keeps
 * NOVA from enemies (weighted by survival), progress to the goal (efficiency) and room to move.
 * Standing still is only allowed when no enemy can reach NOVA next tick.
 */
function bestEscapeStep(v: View, goal: Vec): Vec | null {
  const { s, p } = v;
  const W = p.weights;
  const walk = (i: number) => s.grid[i] === FLOOR;
  const goalDist = bfs(v.w, v.h, [idx(v.w, goal.x, goal.y)], walk);
  const score = (i: number) => {
    const t = v.threat[i] < 0 ? 10 : Math.min(10, v.threat[i]);
    const g = goalDist[i] < 0 ? 60 : goalDist[i];
    const room = Math.min(8, roomAfter(v, { x: i % v.w, y: Math.floor(i / v.w) }));
    const pocket = v.hunted && v.deadEnds[i] ? 60 + W.survival : 0;
    return t * (25 + W.survival) - g * (6 + Math.floor(W.efficiency / 5)) + room * 8 - pocket - (v.collapseCells.has(i) ? 600 : 0) - (t <= 1 ? 400 : 0);
  };
  let best: Vec | null = null;
  let bestScore = -Infinity;
  for (const n of neighbours(v.w, v.h, v.meI)) {
    if (!walk(n)) continue;
    // Value of a first step = its own score plus the best follow-up from there.
    let follow = score(n);
    for (const m of neighbours(v.w, v.h, n)) if (walk(m) && m !== v.meI) follow = Math.max(follow, score(m));
    const total = score(n) + follow;
    if (total > bestScore) {
      bestScore = total;
      best = { x: n % v.w, y: Math.floor(n / v.w) };
    }
  }
  // Standing still is a candidate too (strictly better needed, so NOVA keeps moving on ties).
  const stay = score(v.meI) * 2;
  if (stay > bestScore) best = { ...v.me };
  return best;
}

export function decide(s: GameState, p: Policy): Decision {
  const v = buildView(s, p);
  const W = p.weights;
  const a = s.agent;
  const invulnerable = v.invulnerable;
  const nearest = v.threat[v.meI];

  // 1. Escape.
  if (!s.crystals.length && same(v.me, s.exit)) {
    return { action: "ESCAPE", intent: "escape", reason: "All three crystals collected and NOVA is on the exit portal.", target: s.exit };
  }

  // 2. Pulse bomb against an imminent threat.
  if (a.bombs > 0 && !invulnerable && nearest >= 0) {
    const inBlast = v.activeEnemies.filter((e) => chebyshev(e.pos, v.me) <= s.config.bombRadius);
    const reach = W.aggression >= 65 ? 2 : 1;
    const savingLast = W.resourcefulness >= 70 && a.bombs === 1 && a.hp > 1 && inBlast.length < 2;
    if (inBlast.length && nearest <= reach && !savingLast) {
      const names = inBlast.map((e) => (e.kind === "seeker" ? "Seeker" : "Sentinel")).join(" + ");
      return {
        action: "USE_BOMB",
        intent: "bomb",
        reason: `${names} within ${nearest} tile${nearest === 1 ? "" : "s"} — firing a pulse bomb (${a.bombs - 1} left).`,
        target: null,
      };
    }
  }

  let plans = planGoals(v);
  if (!plans.length) {
    // No route that keeps clear of enemies: allow risky routes rather than giving up.
    v.hard = false;
    plans = planGoals(v);
  }
  const primaryGoal = s.crystals.length ? s.crystals[0] : s.exit;

  // 3. No route anywhere: boxed in by the Echo Trail or a collapse.
  if (!plans.length) {
    if (a.bombs > 0 && bombWouldFreePath(v, primaryGoal)) {
      return { action: "USE_BOMB", intent: "unstick", reason: "Echo Trail has boxed NOVA in — bombing a way out.", target: null };
    }
    if (s.trailExpiry.length && (nearest < 0 || nearest > 2)) {
      return { action: "WAIT", intent: "wait", reason: "Route blocked by crystallised trail — waiting for it to dissolve.", target: null };
    }
    let best: Vec | null = null;
    let bestRoom = -1;
    for (const d of DIRS) {
      const n = { x: v.me.x + d.dx, y: v.me.y + d.dy };
      if (!inBounds(v.w, v.h, n.x, n.y) || s.grid[idx(v.w, n.x, n.y)] !== FLOOR) continue;
      const room = roomAfter(v, n) * 10 + (v.threat[idx(v.w, n.x, n.y)] < 0 ? 10 : Math.min(6, v.threat[idx(v.w, n.x, n.y)]));
      if (room > bestRoom) {
        bestRoom = room;
        best = n;
      }
    }
    if (best) return { action: actionTowards(v.me, best), intent: "unstick", reason: `No route to a target — moving to open space at ${fmt(best)}.`, target: best };
    return { action: "WAIT", intent: "wait", reason: "Completely boxed in with no bombs — holding position.", target: null };
  }

  let plan = plans[0];

  // 4. Echo Trail lookahead: don't walk into a pocket we can't get out of.
  if (plan.path.length > 1 && roomAfter(v, plan.path[0]) < 4 && a.bombs === 0) {
    const alt = plans.find((pl) => pl.path.length && roomAfter(v, pl.path[0]) >= 4);
    if (alt) plan = alt;
  }

  const next = plan.path[0];
  const nextI = idx(v.w, next.x, next.y);
  const label =
    plan.kind === "crystal"
      ? `crystal at ${fmt(plan.goal)}`
      : plan.kind === "exit"
        ? `exit portal at ${fmt(plan.goal)}`
        : `bonus item at ${fmt(plan.goal)}`;

  // 5. Evade if the next step walks into reach of an enemy.
  const danger = !invulnerable && v.threat[nextI] >= 0 && v.threat[nextI] <= 1;
  if (danger) {
    const best = bestEscapeStep(v, plan.goal);
    if (best && !same(best, next)) {
      if (same(best, v.me)) return { action: "WAIT", intent: "flee", reason: `Enemy guarding the route to the ${label} — holding a safe position.`, target: plan.goal };
      return {
        action: actionTowards(v.me, best),
        intent: "flee",
        reason: `Enemy ${v.threat[nextI]} tile${v.threat[nextI] === 1 ? "" : "s"} from the planned step — dodging to ${fmt(best)}.`,
        target: plan.goal,
      };
    }
  }

  const threatNote = nearest >= 0 ? ` Nearest enemy ${nearest} tiles away.` : "";
  const intent: Intent = plan.kind;
  return {
    action: actionTowards(v.me, next),
    intent,
    reason: `Heading to the ${label} — ${plan.path.length} steps.${threatNote}`,
    target: plan.goal,
  };
}
