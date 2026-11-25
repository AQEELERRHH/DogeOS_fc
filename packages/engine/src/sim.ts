import { STYLE_TACTICS } from "./clubs";
import { aiManagerUpdate } from "./manager";
import { Rng, seedFromString } from "./rng";
import { FORMATIONS, GOAL_HALF, LENGTH, WIDTH, attackGoal, dir, ownGoal, toPitch } from "./tactics";
import type {
  BallState,
  MatchConfig,
  MatchEvent,
  Phase,
  PlayerState,
  Tactics,
  TacticsInput,
  TeamStats,
  V2,
} from "./types";

export const TICKS_PER_SECOND = 10;
const FRICTION = 0.955;
const CONTROL_R = 0.8;
const WALL = 0.3;

export interface ShotPlan {
  result: "goal" | "save" | "miss";
  keeper: number;
  atTick: number;
  held: boolean;
  shooter: number;
  /** Where the shot crosses the goal line (y). */
  lineY: number;
}

export interface MatchState {
  config: MatchConfig;
  tick: number;
  phase: Phase;
  phaseUntil: number;
  kickoffTeam: 0 | 1;
  players: PlayerState[];
  ball: BallState;
  score: [number, number];
  tactics: [Tactics, Tactics];
  stats: [TeamStats, TeamStats];
  events: MatchEvent[];
  rng: number;
  shot: ShotPlan | null;
  /** Last completed pass into the scorer, for assists. */
  lastPasser: [number, number];
  /** Possession ticks per team since the AI manager last looked. */
  window: [number, number];
  /** Per-player tackle cooldown (tick). */
  tackleReadyAt: number[];
  /** Dribble target for the current carrier. */
  carrierTarget: V2 | null;
  /** Half-time has been reached (so it fires exactly once, even during a stoppage). */
  halfDone: boolean;
}

const emptyStats = (): TeamStats => ({
  goals: 0, shots: 0, onTarget: 0, passes: 0, passesCompleted: 0, tackles: 0, interceptions: 0, saves: 0, possessionTicks: 0,
});

// ---------------------------------------------------------------- vectors
const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: V2, k: number): V2 => ({ x: a.x * k, y: a.y * k });
const len = (a: V2) => Math.sqrt(a.x * a.x + a.y * a.y);
const dist = (a: V2, b: V2) => len(sub(a, b));
const norm = (a: V2): V2 => {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clampPitch = (p: V2): V2 => ({ x: clamp(p.x, WALL, LENGTH - WALL), y: clamp(p.y, WALL, WIDTH - WALL) });

/** Distance from point p to segment ab, and how far along it (0..1) the closest point is. */
function segDist(p: V2, a: V2, b: V2) {
  const ab = sub(b, a);
  const l2 = ab.x * ab.x + ab.y * ab.y;
  const s = l2 > 0 ? clamp(((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2, 0, 1) : 0;
  return { d: dist(p, add(a, mul(ab, s))), s };
}

const teamOf = (idx: number): 0 | 1 => (idx < 5 ? 0 : 1);
const relX = (team: 0 | 1, x: number) => (team === 0 ? x : LENGTH - x) / LENGTH;

// ---------------------------------------------------------------- setup
export function createMatch(config: MatchConfig, startTactics?: [Tactics | null, Tactics | null]): MatchState {
  const rng = new Rng(seedFromString(`fc|${config.seed}|${config.home.id}|${config.away.id}`));
  const tactics: [Tactics, Tactics] = [
    startTactics?.[0] ?? { ...STYLE_TACTICS[config.home.style] },
    startTactics?.[1] ?? { ...STYLE_TACTICS[config.away.style] },
  ];
  const players: PlayerState[] = [];
  [config.home, config.away].forEach((club, t) => {
    club.squad.forEach((def, i) => {
      players.push({
        idx: t * 5 + i,
        team: t as 0 | 1,
        slot: i,
        def,
        pos: { x: 0, y: 0 },
        vel: { x: 0, y: 0 },
        stamina: 100,
        cooldown: 0,
        beatenUntil: 0,
      });
    });
  });
  const s: MatchState = {
    config,
    tick: 0,
    phase: "kickoff",
    phaseUntil: 0,
    kickoffTeam: 0,
    players,
    ball: { pos: { x: LENGTH / 2, y: WIDTH / 2 }, vel: { x: 0, y: 0 }, owner: -1, lastTouch: -1, flight: null, noTouchBy: -1, noTouchUntil: 0 },
    score: [0, 0],
    tactics,
    stats: [emptyStats(), emptyStats()],
    events: [],
    rng: rng.state,
    shot: null,
    lastPasser: [-1, -1],
    window: [0, 0],
    tackleReadyAt: new Array(10).fill(0),
    carrierTarget: null,
    halfDone: false,
  };
  assignSlots(s, 0);
  assignSlots(s, 1);
  setupKickoff(s, 0);
  return s;
}

/** Puts players into formation slots by preferred role (GK always slot 0). */
function assignSlots(s: MatchState, team: 0 | 1) {
  const f = FORMATIONS[s.tactics[team].formation];
  const outfield = s.players.filter((p) => p.team === team && p.def.role !== "GK");
  const free = [...outfield];
  const order = [1, 2, 3, 4];
  for (const slot of order) {
    const want = f.slots[slot - 1].role;
    let i = free.findIndex((p) => p.def.role === want);
    if (i < 0) i = free.findIndex((p) => (want === "MID" ? p.def.role !== "DEF" : true));
    if (i < 0) i = 0;
    free[i].slot = slot;
    free.splice(i, 1);
  }
  const gk = s.players.find((p) => p.team === team && p.def.role === "GK");
  if (gk) gk.slot = 0;
}

function slotHome(s: MatchState, p: PlayerState): V2 {
  if (p.slot === 0) return { x: 0.04, y: 0.5 };
  const sl = FORMATIONS[s.tactics[p.team].formation].slots[p.slot - 1];
  return { x: sl.x, y: sl.y };
}

function setupKickoff(s: MatchState, team: 0 | 1) {
  s.phase = "kickoff";
  s.phaseUntil = s.tick + 12;
  s.kickoffTeam = team;
  s.shot = null;
  s.carrierTarget = null;
  for (const p of s.players) {
    const h = slotHome(s, p);
    const rel = { x: Math.min(0.46, h.x * 0.75), y: h.y };
    p.pos = toPitch(p.team, { x: rel.x * LENGTH, y: rel.y * WIDTH });
    p.vel = { x: 0, y: 0 };
    p.cooldown = 0;
    p.beatenUntil = 0;
  }
  // The most attacking player of the kicking team takes it from the centre spot.
  const taker = s.players
    .filter((p) => p.team === team && p.slot !== 0)
    .sort((a, b) => slotHome(s, b).x - slotHome(s, a).x || a.idx - b.idx)[0];
  taker.pos = { x: LENGTH / 2 - dir(team) * 0.6, y: WIDTH / 2 };
  s.ball = { pos: { x: LENGTH / 2, y: WIDTH / 2 }, vel: { x: 0, y: 0 }, owner: taker.idx, lastTouch: taker.idx, flight: null, noTouchBy: -1, noTouchUntil: 0 };
  taker.cooldown = 3;
  s.events.push({ t: s.tick, type: "kickoff", team });
}

// ---------------------------------------------------------------- helpers
function maxSpeed(p: PlayerState) {
  const base = (4.6 + p.def.attrs.pace * 0.032) / TICKS_PER_SECOND;
  return base * (0.72 + 0.28 * (p.stamina / 100));
}

function moveTowards(p: PlayerState, target: V2, sprint: boolean, s: MatchState, factor = 1) {
  const t = clampPitch(target);
  const v = sub(t, p.pos);
  const d = len(v);
  const top = maxSpeed(p) * (sprint ? 1 : 0.6) * factor;
  const step = Math.min(d, top);
  // Keep a little space from team-mates so players don't stack up.
  let sep = { x: 0, y: 0 };
  for (const q of s.players) {
    if (q === p || q.team !== p.team) continue;
    const dd = dist(p.pos, q.pos);
    if (dd < 2 && dd > 1e-6) sep = add(sep, mul(norm(sub(p.pos, q.pos)), (2 - dd) * 0.04));
  }
  const vel = add(mul(norm(v), step), sep);
  p.vel = vel;
  p.pos = clampPitch(add(p.pos, vel));
  const effort = step / Math.max(1e-6, maxSpeed(p));
  const drain = sprint && effort > 0.7 ? 0.05 * (1.45 - p.def.attrs.stamina / 100) : -0.025;
  p.stamina = clamp(p.stamina - drain, 0, 100);
}

function opponents(s: MatchState, team: 0 | 1) {
  return s.players.filter((p) => p.team !== team);
}

function pressureOn(s: MatchState, p: PlayerState, r = 2.2) {
  let total = 0;
  for (const o of opponents(s, p.team)) {
    const d = dist(o.pos, p.pos);
    if (d < r && s.tick >= o.beatenUntil) total += (r - d) / r;
  }
  return total;
}

function keeperOf(s: MatchState, team: 0 | 1) {
  return s.players.find((p) => p.team === team && p.slot === 0)!;
}

// ---------------------------------------------------------------- on-ball decisions
interface Option {
  kind: "pass" | "shoot" | "dribble" | "hold";
  value: number;
  target?: PlayerState;
  point?: V2;
}

function evaluateOptions(s: MatchState, me: PlayerState, rng: Rng): Option {
  const T = s.tactics[me.team];
  const a = me.def.attrs;
  const goal = attackGoal(me.team);
  const dGoal = dist(me.pos, goal);
  const press = pressureOn(s, me);
  const opts: Option[] = [];

  // Shoot
  const st = me.def.style;
  const range = 4 + a.shooting * 0.12 + (st === "poacher" ? 0.5 : 0);
  if (dGoal < range && me.slot !== 0) {
    let blockers = 0;
    for (const o of opponents(s, me.team)) {
      if (o.slot === 0) continue;
      const { d, s: along } = segDist(o.pos, me.pos, goal);
      if (d < 1.1 && along > 0.05) blockers += 1;
    }
    const angle = Math.abs(me.pos.y - goal.y) / Math.max(1, dGoal); // 0 = straight on
    const xg = clamp(1.1 - dGoal / 13, 0.03, 0.8) * (0.55 + a.shooting / 220) * (1 - Math.min(0.75, blockers * 0.28 + press * 0.12)) * (1 - angle * 0.45);
    const shootK = st === "poacher" ? 1.25 : st === "box2box" ? 1.1 : st === "playmaker" ? 0.9 : st === "target" ? 0.8 : st === "stopper" || st === "cover" ? 0.8 : 1;
    if (xg > 0.1) opts.push({ kind: "shoot", value: xg * 115 * (0.85 + 0.075 * T.mentality) * shootK });
  }

  // Pass
  const P = T.passing;
  const wProg = 1.1 + P * 0.9;
  const wRisk = 9 - P * 2.4;
  const passRange = 10 + a.passing * 0.14;
  for (const t of s.players) {
    if (t.team !== me.team || t === me) continue;
    const d = dist(me.pos, t.pos);
    if (d < 2.5 || d > passRange) continue;
    const progress = (relX(me.team, t.pos.x) - relX(me.team, me.pos.x)) * LENGTH;
    let risk = 0;
    for (const o of opponents(s, me.team)) {
      const { d: pd, s: along } = segDist(o.pos, me.pos, t.pos);
      if (pd < 1.7 && along > 0.08) risk += (1.7 - pd) * (1.15 - along * 0.35);
    }
    const recvPress = pressureOn(s, t, 2.6);
    const threat = clamp(1.1 - dist(t.pos, goal) / 13, 0, 1);
    const distPen = Math.max(0, d - 9) * (P === 0 ? 0.6 : P === 1 ? 0.25 : 0.05);
    let v = 32 + progress * wProg - risk * wRisk - recvPress * 7 - distPen + threat * 38;
    if (t.slot === 0) v -= 22 + (relX(me.team, me.pos.x) > 0.4 ? 30 : 0);
    if (progress < -4 && P === 2) v -= 8;
    if (st === "playmaker") v += 8 + Math.max(0, progress) * 0.35;
    else if (st === "target") v += 7; // lay it off to a runner
    if (t.def.style === "target" && relX(me.team, t.pos.x) > 0.55) v += 4; // aim for the big man
    opts.push({ kind: "pass", value: v, target: t });
  }

  // Dribble
  if (me.slot !== 0 || relX(me.team, me.pos.x) > 0.2) {
    const towards = norm(sub({ x: goal.x, y: goal.y + (me.pos.y - goal.y) * 0.4 }, me.pos));
    const point = add(me.pos, mul(towards, 3.5));
    let ahead = 0;
    for (const o of opponents(s, me.team)) {
      if (s.tick < o.beatenUntil) continue;
      const { d, s: along } = segDist(o.pos, me.pos, add(me.pos, mul(towards, 5)));
      if (d < 1.6 && along > 0.05) ahead += 1.6 - d;
    }
    const near = dGoal < 12 ? 10 : 0;
    opts.push({ kind: "dribble", value: 22 + 3.5 * 1.7 + a.dribbling * 0.22 - ahead * 16 + near + (T.mentality - 2) * 3, point });
  }

  // Hold / shield: drift away from the nearest opponent.
  let nearest: PlayerState | null = null;
  for (const o of opponents(s, me.team)) if (!nearest || dist(o.pos, me.pos) < dist(nearest.pos, me.pos)) nearest = o;
  const away = nearest ? norm(sub(me.pos, nearest.pos)) : { x: dir(me.team), y: 0 };
  opts.push({ kind: "hold", value: 16 - press * (st === "target" ? 3 : 6) + (st === "target" ? 8 : 0), point: add(me.pos, mul(away, 2)) });

  let best = opts[0];
  let bestV = -Infinity;
  for (const o of opts) {
    const v = o.value + (rng.next() % 1000) / 1000 * 6;
    if (v > bestV) {
      bestV = v;
      best = o;
    }
  }
  return best;
}

function rand(rng: Rng) {
  return (rng.next() % 100000) / 100000;
}

function kickPass(s: MatchState, me: PlayerState, to: PlayerState, rng: Rng) {
  const a = me.def.attrs;
  const d = dist(me.pos, to.pos);
  const v0 = clamp(d * 0.07 + 0.65, 0.9, 2.3);
  const leadTicks = Math.min(12, d / v0) * 0.6;
  let target = add(to.pos, mul(to.vel, leadTicks));
  const perp = norm({ x: -(target.y - me.pos.y), y: target.x - me.pos.x });
  const err = ((100 - a.passing) / 100) * 0.2 * d + pressureOn(s, me) * 0.45;
  target = add(target, mul(perp, (rand(rng) * 2 - 1) * err));
  s.ball.vel = mul(norm(sub(target, me.pos)), v0);
  s.ball.owner = -1;
  s.ball.lastTouch = me.idx;
  s.ball.flight = { kind: "pass", from: me.idx, to: to.idx, tick: s.tick };
  s.ball.noTouchBy = me.idx;
  s.ball.noTouchUntil = s.tick + 3;
  s.stats[me.team].passes++;
  const progressive = (relX(me.team, to.pos.x) - relX(me.team, me.pos.x)) * LENGTH > 6;
  s.events.push({ t: s.tick, type: "pass", from: me.idx, to: to.idx, progressive });
}

function kickShot(s: MatchState, me: PlayerState, rng: Rng) {
  const a = me.def.attrs;
  const goal = attackGoal(me.team);
  const keeper = keeperOf(s, me.team === 0 ? 1 : 0);
  const d = dist(me.pos, goal);
  const aimSide = keeper.pos.y < goal.y ? 1 : -1;
  const aimY = goal.y + aimSide * GOAL_HALF * 0.62;
  const press = pressureOn(s, me);
  const finish = me.def.style === "poacher" && d < 9 ? 0.82 : me.def.style === "target" ? 1.08 : 1;
  const errY = (rand(rng) * 2 - 1) * (((100 - a.shooting) / 100) * 2.6 + d * 0.11 + press * 0.7) * finish;
  const lineY = aimY + errY;
  const target = { x: goal.x, y: lineY };
  const v0 = 2.2 + a.shooting * 0.008;
  const onTarget = Math.abs(lineY - goal.y) < GOAL_HALF - 0.15;

  s.ball.vel = mul(norm(sub(target, me.pos)), v0);
  s.ball.owner = -1;
  s.ball.lastTouch = me.idx;
  s.ball.flight = { kind: "shot", from: me.idx, to: -1, tick: s.tick };
  s.ball.noTouchBy = me.idx;
  s.ball.noTouchUntil = s.tick + 3;
  s.stats[me.team].shots++;
  s.events.push({ t: s.tick, type: "shot", by: me.idx, dist: Math.round(d), onTarget });

  // Bodies in the way: each defender close to the shooting line may block it.
  for (const o of opponents(s, me.team)) {
    if (o.slot === 0 || s.tick < o.beatenUntil) continue;
    const { d: pd, s: along } = segDist(o.pos, me.pos, target);
    if (pd < 1.0 && along > 0.05 && along < 0.8 && rand(rng) < 0.3 + o.def.attrs.positioning / 400 + (o.def.style === "cover" ? 0.08 : 0)) {
      s.events.push({ t: s.tick, type: "interception", by: o.idx, from: me.idx });
      s.stats[o.team].interceptions++;
      s.ball.pos = add(o.pos, mul(norm(sub(me.pos, o.pos)), 0.6));
      s.ball.vel = mul(norm({ x: -dir(me.team) * 0.5 + (rand(rng) - 0.5), y: rand(rng) - 0.5 }), 0.6);
      s.ball.flight = null;
      s.ball.noTouchBy = o.idx;
      s.ball.noTouchUntil = s.tick + 3;
      s.shot = null;
      return;
    }
  }
  if (onTarget) s.stats[me.team].onTarget++;

  // Resolve the keeper's chance now, so the outcome is fixed and deterministic.
  const lineDist = Math.abs(goal.x - me.pos.x) / Math.max(0.2, Math.abs(norm(sub(target, me.pos)).x));
  const arg = 1 - (lineDist * (1 - FRICTION)) / v0;
  const n = arg <= 0.05 ? 40 : Math.ceil(Math.log(arg) / Math.log(FRICTION));
  const kA = keeper.def.attrs;
  if (!onTarget) {
    s.shot = { result: "miss", keeper: keeper.idx, atTick: s.tick + n, held: false, shooter: me.idx, lineY };
    return;
  }
  if (arg <= 0.05) {
    // Scuffed: it won't reach the line. The keeper gathers it.
    s.shot = { result: "save", keeper: keeper.idx, atTick: s.tick + 14, held: true, shooter: me.idx, lineY };
    return;
  }
  const reach = maxSpeed(keeper) * n * 0.8 + 1.0 + kA.reflexes * 0.015;
  const need = Math.abs(lineY - keeper.pos.y);
  if (need > reach) {
    s.shot = { result: "goal", keeper: keeper.idx, atTick: s.tick + n, held: false, shooter: me.idx, lineY };
    return;
  }
  const kStyle = keeper.def.style === "line" ? 0.03 : keeper.def.style === "sweeper" ? -Math.max(0, d - 10) * 0.006 : 0;
  const ps = clamp(0.8 + kStyle + (kA.reflexes - 60) / 100 - (v0 - 2.4) * 0.35 + (need < 1 ? 0.08 : 0) - 0.25 * (need / reach) - Math.max(0, 8 - d) * 0.03, 0.15, 0.94);
  const saved = rand(rng) < ps;
  s.shot = {
    result: saved ? "save" : "goal",
    keeper: keeper.idx,
    atTick: s.tick + Math.max(1, n - 1),
    held: saved && rand(rng) < 0.55 + kA.reflexes / 300,
    shooter: me.idx,
    lineY,
  };
}

// ---------------------------------------------------------------- positioning
function targetFor(s: MatchState, p: PlayerState, attacking: boolean): { point: V2; sprint: boolean } {
  const T = s.tactics[p.team];
  const ball = s.ball.pos;
  const bx = relX(p.team, ball.x);
  const by = p.team === 0 ? ball.y / WIDTH : 1 - ball.y / WIDTH;
  const h = slotHome(s, p);

  if (p.slot === 0) {
    const sweeper = p.def.style === "sweeper";
    const out = sweeper ? (bx < 0.35 ? 0.1 : 0.16) : bx < 0.35 ? 0.07 : 0.04;
    const gy = clamp(0.5 + (by - 0.5) * 0.35, 0.5 - (GOAL_HALF - 0.3) / WIDTH, 0.5 + (GOAL_HALF - 0.3) / WIDTH);
    return { point: toPitch(p.team, { x: out * LENGTH, y: gy * WIDTH }), sprint: bx < 0.3 };
  }

  const widthK = 0.75 + 0.22 * T.width;
  if (attacking) {
    let x = h.x + (T.mentality - 2) * 0.06 + (bx - 0.45) * 0.35;
    const role = FORMATIONS[T.formation].slots[p.slot - 1].role;
    const st = p.def.style;
    if (st === "target") x -= 0.06;
    else if (st === "box2box") x += 0.06;
    else if (st === "playmaker") x -= 0.04;
    else if (st === "stopper") x += 0.03;
    else if (st === "cover") x -= 0.04;
    if (role === "FWD" && bx > 0.3 && st !== "target") {
      // Run in behind: stay just beyond the deepest outfield defender.
      const defenders = opponents(s, p.team).filter((o) => o.slot !== 0);
      const deepest = Math.max(...defenders.map((o) => relX(p.team, o.pos.x)));
      x = Math.max(x, Math.min(0.9, deepest + (st === "poacher" ? 0.06 : 0.04)));
    }
    let y = 0.5 + (h.y - 0.5) * widthK;
    if (st === "playmaker") y = 0.5 + (y - 0.5) * 0.6;
    x = clamp(x, 0.08, 0.92);
    return { point: toPitch(p.team, { x: x * LENGTH, y: y * WIDTH }), sprint: (role === "FWD" && bx > 0.35 && st !== "target") || (st === "box2box" && bx > 0.55) };
  }

  // Defending: compact block that slides with the ball.
  const dst = p.def.style;
  let x = h.x * 0.72 + (T.mentality - 2) * 0.05 + (bx - 0.5) * 0.28 - 0.02 + T.pressing * 0.03;
  if (dst === "poacher") x += 0.08; // stays high for the counter
  else if (dst === "stopper") x += 0.03;
  else if (dst === "cover") x -= 0.04;
  else if (dst === "playmaker") x -= 0.02;
  let y = (0.5 + (h.y - 0.5) * (widthK - 0.15)) * 0.62 + by * 0.38;
  x = clamp(x, 0.06, 0.8);
  let point = toPitch(p.team, { x: x * LENGTH, y: y * WIDTH });
  // Mark the most dangerous attacker near my zone: goal-side of him.
  const goal = ownGoal(p.team);
  let mark: PlayerState | null = null;
  let best = 5.5;
  for (const o of opponents(s, p.team)) {
    if (o.slot === 0 || o.idx === s.ball.owner) continue;
    const d = dist(o.pos, point);
    if (d < best) {
      best = d;
      mark = o;
    }
  }
  if (mark) point = add(mark.pos, mul(norm(sub(goal, mark.pos)), 1.3));
  return { point, sprint: false };
}

// ---------------------------------------------------------------- main step
export function step(s: MatchState, inputs: TacticsInput[] = []): MatchState {
  if (s.phase === "fulltime") return s;
  const rng = new Rng(s.rng);

  for (const inp of inputs) if (inp.t === s.tick) applyTactics(s, inp.team, inp.tactics, "Manager's instruction", false);

  if (s.phase === "goal" || s.phase === "halftime") {
    if (s.tick >= s.phaseUntil) {
      if (s.phase === "halftime") setupKickoff(s, 1);
      else setupKickoff(s, s.kickoffTeam);
    }
    s.rng = rng.state;
    // The clock keeps running during stoppages, so half-time and full-time still trigger.
    advanceClock(s);
    return s;
  }
  if (s.phase === "kickoff" && s.tick >= s.phaseUntil) s.phase = "play";

  const ball = s.ball;
  const owner = ball.owner >= 0 ? s.players[ball.owner] : null;
  const attackingTeam: 0 | 1 | -1 = owner ? owner.team : ball.flight?.kind === "pass" ? teamOf(ball.flight.from) : -1;
  if (owner) {
    s.stats[owner.team].possessionTicks++;
    s.window[owner.team]++;
  }

  // ---------- who chases a loose ball / pressures the carrier
  const chasers = new Set<number>();
  const predicted = add(ball.pos, mul(ball.vel, 4));
  for (const team of [0, 1] as const) {
    const pool = s.players.filter((p) => p.team === team && s.tick >= p.beatenUntil && (p.slot !== 0 || relX(team, predicted.x) < (p.def.style === "sweeper" ? 0.28 : 0.18)));
    if (!owner) {
      if (ball.flight?.kind === "pass" && teamOf(ball.flight.from) === team) {
        chasers.add(ball.flight.to);
        continue;
      }
      const c = pool.sort((a, b) => dist(a.pos, predicted) - dist(b.pos, predicted) || a.idx - b.idx)[0];
      if (c) chasers.add(c.idx);
    } else if (owner.team !== team) {
      const T = s.tactics[team];
      const depth = relX(team, ball.pos.x);
      const engage = T.pressing === 0 ? 0.42 : T.pressing === 1 ? 0.62 : 1.01;
      const outfield = pool.filter((p) => p.slot !== 0).sort((a, b) => dist(a.pos, owner.pos) - dist(b.pos, owner.pos) || a.idx - b.idx);
      if (depth < engage || dist(outfield[0]?.pos ?? owner.pos, owner.pos) < 3) {
        if (outfield[0]) chasers.add(outfield[0].idx);
        if (T.pressing === 2 && outfield[1] && depth > 0.45) chasers.add(outfield[1].idx);
        else if (outfield[1]?.def.style === "box2box" && depth > 0.5 && dist(outfield[1].pos, owner.pos) < 6) chasers.add(outfield[1].idx);
      }
    }
  }

  // ---------- movement & decisions
  for (const p of s.players) {
    if (p.cooldown > 0) p.cooldown--;
    if (owner && p === owner) continue;
    if (s.shot && p.idx === s.shot.keeper) {
      const k = s.shot.result === "goal" ? 0.55 : 1; // beaten keepers don't quite get there
      const line = toPitch(p.team, { x: 0.6, y: 0 });
      const goalY = p.team === 0 ? s.shot.lineY : s.shot.lineY;
      moveTowards(p, { x: line.x, y: p.pos.y + (goalY - p.pos.y) * k }, true, s, 1.4);
      continue;
    }
    if (chasers.has(p.idx)) {
      const tgt = owner ? add(owner.pos, mul(norm(sub(ownGoal(p.team), owner.pos)), 0.5)) : ball.flight?.to === p.idx ? add(ball.pos, mul(ball.vel, 2)) : predicted;
      moveTowards(p, tgt, true, s);
      continue;
    }
    const attacking = attackingTeam === p.team;
    const { point, sprint } = targetFor(s, p, attacking);
    // Support the carrier: nearest team-mate offers a short option.
    if (owner && owner.team === p.team && p.slot !== 0) {
      const mates = s.players.filter((q) => q.team === p.team && q !== owner && q.slot !== 0).sort((a, b) => dist(a.pos, owner.pos) - dist(b.pos, owner.pos) || a.idx - b.idx);
      if (mates[0] === p) {
        const side = p.pos.y > owner.pos.y ? 1 : -1;
        const sup = add(owner.pos, { x: dir(p.team) * 3, y: side * 5 });
        moveTowards(p, { x: (sup.x + point.x) / 2, y: (sup.y + point.y) / 2 }, false, s);
        continue;
      }
    }
    moveTowards(p, point, sprint, s);
  }

  // ---------- ball carrier
  if (owner && s.phase === "play") {
    if (owner.cooldown <= 0) {
      const choice = evaluateOptions(s, owner, rng);
      if (choice.kind === "pass" && choice.target) kickPass(s, owner, choice.target, rng);
      else if (choice.kind === "shoot") kickShot(s, owner, rng);
      else {
        s.carrierTarget = choice.point ?? null;
        owner.cooldown = choice.kind === "dribble" ? 3 : 2;
      }
    }
    if (s.ball.owner === owner.idx) {
      const tgt = s.carrierTarget ?? add(owner.pos, { x: dir(owner.team) * 2, y: 0 });
      moveTowards(owner, tgt, true, s, 0.82);
      const facing = norm(sub(tgt, owner.pos));
      s.ball.pos = add(owner.pos, mul(facing.x || facing.y ? facing : { x: dir(owner.team), y: 0 }, 0.45));
      s.ball.vel = { x: 0, y: 0 };
    }
  } else if (owner && s.phase === "kickoff") {
    s.ball.pos = add(owner.pos, { x: dir(owner.team) * 0.45, y: 0 });
  }

  // ---------- tackles
  if (s.ball.owner >= 0 && s.phase === "play") {
    const c = s.players[s.ball.owner];
    for (const d of opponents(s, c.team)) {
      if (d.slot === 0 && relX(d.team, c.pos.x) > 0.2) continue;
      if (s.tick < d.beatenUntil || s.tick < s.tackleReadyAt[d.idx]) continue;
      if (dist(d.pos, c.pos) > 1.1) continue;
      s.tackleReadyAt[d.idx] = s.tick + 6;
      const pWin = clamp(0.36 + (d.def.attrs.tackling - c.def.attrs.dribbling) / 170 + (d.def.style === "stopper" ? 0.06 : 0), 0.12, 0.8);
      if (rand(rng) < pWin) {
        s.stats[d.team].tackles++;
        s.events.push({ t: s.tick, type: "tackle", by: d.idx, on: c.idx, won: true });
        c.beatenUntil = s.tick + 6;
        if (rand(rng) < 0.55) {
          s.ball.owner = d.idx;
          s.ball.lastTouch = d.idx;
          d.cooldown = 2;
          s.carrierTarget = null;
        } else {
          s.ball.owner = -1;
          s.ball.flight = null;
          s.ball.vel = mul(norm({ x: dir(d.team) * 0.6 + (rand(rng) - 0.5), y: rand(rng) - 0.5 }), 0.6);
          s.ball.lastTouch = d.idx;
          s.ball.noTouchBy = c.idx;
          s.ball.noTouchUntil = s.tick + 4;
        }
        break;
      } else {
        d.beatenUntil = s.tick + 12;
        s.events.push({ t: s.tick, type: "dribble", by: c.idx, past: d.idx });
      }
    }
  }

  // ---------- loose ball physics
  if (s.ball.owner < 0) {
    const b = s.ball;
    b.pos = add(b.pos, b.vel);
    b.vel = mul(b.vel, FRICTION);
    if (len(b.vel) < 0.02) b.vel = { x: 0, y: 0 };

    // Shot resolution: at the planned tick, or the moment the ball reaches the goal line.
    const atLine = b.pos.x <= 0.4 || b.pos.x >= LENGTH - 0.4;
    if (s.shot && s.shot.result === "save" && (s.tick >= s.shot.atTick || atLine)) resolveSave(s, rng);
    if (s.ball.owner >= 0) {
      s.rng = rng.state;
      aiManagerUpdate(s);
      advanceClock(s);
      return s;
    }

    // Safety: a shot that never reached the line becomes a normal loose ball.
    if (s.shot && s.tick > s.shot.atTick + 6) {
      if (s.shot.result === "miss") s.events.push({ t: s.tick, type: "miss", by: s.shot.shooter });
      s.shot = null;
      b.flight = null;
    }

    // Side walls bounce.
    if (b.pos.y < WALL || b.pos.y > WIDTH - WALL) {
      b.pos.y = clamp(b.pos.y, WALL, WIDTH - WALL);
      b.vel.y = -b.vel.y * 0.7;
    }
    // Goal line.
    if (b.pos.x <= 0 || b.pos.x >= LENGTH) {
      const team: 0 | 1 = b.pos.x >= LENGTH ? 0 : 1; // team attacking that goal
      const inMouth = Math.abs(b.pos.y - WIDTH / 2) < GOAL_HALF;
      if (inMouth && s.shot?.result === "miss") s.events.push({ t: s.tick, type: "miss", by: s.shot.shooter });
      if (inMouth && s.shot?.result !== "miss") {
        scoreGoal(s, team);
        s.rng = rng.state;
        advanceClock(s);
        return s;
      }
      // Wide: goal kick to the defending keeper.
      const k = keeperOf(s, team === 0 ? 1 : 0);
      if (s.shot?.result === "miss" && !inMouth) s.events.push({ t: s.tick, type: "miss", by: s.shot.shooter });
      s.shot = null;
      b.flight = null;
      b.owner = k.idx;
      b.lastTouch = k.idx;
      b.vel = { x: 0, y: 0 };
      k.pos = toPitch(k.team, { x: 1.5, y: WIDTH / 2 });
      b.pos = { ...k.pos };
      k.cooldown = 10;
    }
  }

  // ---------- control of a loose ball
  if (s.ball.owner < 0 && s.phase === "play") {
    const b = s.ball;
    const speed = len(b.vel);
    const near = s.players
      .filter((p) => dist(p.pos, b.pos) < CONTROL_R && !(p.idx === b.noTouchBy && s.tick < b.noTouchUntil))
      .sort((a, c) => dist(a.pos, b.pos) - dist(c.pos, b.pos) || a.idx - c.idx);
    for (const p of near) {
      if (s.shot && s.shot.result !== "save") {
        // Only a blocking defender can touch a shot on its way.
        if (p.team === teamOf(s.shot.shooter) || p.slot === 0) continue;
        if (rand(rng) > 0.22) continue;
        s.events.push({ t: s.tick, type: "interception", by: p.idx, from: s.shot.shooter });
        s.stats[p.team].interceptions++;
        s.shot = null;
        b.flight = null;
        b.vel = mul(norm({ x: dir(p.team), y: rand(rng) * 2 - 1 }), 0.5);
        b.lastTouch = p.idx;
        b.noTouchBy = p.idx;
        b.noTouchUntil = s.tick + 3;
        break;
      }
      if (s.shot) continue;
      const passing = b.flight?.kind === "pass" ? b.flight : null;
      const intended = passing && passing.to === p.idx;
      const sameTeamAsPasser = passing && teamOf(passing.from) === p.team;
      let pCtrl = 0.62 + p.def.attrs.dribbling / 400 - Math.max(0, speed - 1.5) * 0.35;
      if (intended) pCtrl += 0.25;
      else if (passing && !sameTeamAsPasser) pCtrl = 0.28 + p.def.attrs.positioning / 260 - Math.max(0, speed - 1.2) * 0.3;
      if (rand(rng) < clamp(pCtrl, 0.05, 0.97)) {
        if (passing) {
          if (sameTeamAsPasser) {
            s.stats[p.team].passesCompleted++;
            s.lastPasser[p.team] = passing.from;
            s.events.push({ t: s.tick, type: "pass_complete", from: passing.from, to: p.idx });
          } else {
            s.stats[p.team].interceptions++;
            s.events.push({ t: s.tick, type: "interception", by: p.idx, from: passing.from });
            s.lastPasser[p.team] = -1;
          }
        } else if (b.lastTouch >= 0 && teamOf(b.lastTouch) !== p.team) s.lastPasser[p.team] = -1;
        b.owner = p.idx;
        b.lastTouch = p.idx;
        b.flight = null;
        b.vel = { x: 0, y: 0 };
        p.cooldown = intended ? 2 : 3;
        s.carrierTarget = null;
        break;
      } else {
        // Heavy touch: the ball squirms away.
        b.vel = mul(norm({ x: b.vel.x * 0.5 + (rand(rng) - 0.5), y: b.vel.y * 0.5 + (rand(rng) - 0.5) }), Math.max(0.3, speed * 0.4));
        b.flight = null;
        b.lastTouch = p.idx;
        b.noTouchBy = p.idx;
        b.noTouchUntil = s.tick + 3;
        break;
      }
    }
    // A pass that's rolled dead is just a loose ball.
    if (b.owner < 0 && b.flight?.kind === "pass" && len(b.vel) < 0.15) b.flight = null;
  }

  // ---------- AI managers & clock
  s.rng = rng.state;
  aiManagerUpdate(s);
  advanceClock(s);
  return s;
}

function advanceClock(s: MatchState) {
  s.tick++;
  const H = s.config.halfTicks;
  if (!s.halfDone && s.tick >= H) {
    s.halfDone = true;
    s.phase = "halftime";
    s.phaseUntil = s.tick + 30;
    s.events.push({ t: s.tick, type: "halftime", score: [...s.score] as [number, number] });
    aiManagerUpdate(s, true);
  } else if (s.tick >= 2 * H) {
    s.phase = "fulltime";
    s.events.push({ t: s.tick, type: "fulltime", score: [...s.score] as [number, number] });
  }
}

function resolveSave(s: MatchState, rng: Rng) {
  const plan = s.shot!;
  const b = s.ball;
  const k = s.players[plan.keeper];
  s.stats[k.team].saves++;
  s.events.push({ t: s.tick, type: "save", by: k.idx, shooter: plan.shooter, held: plan.held });
  s.shot = null;
  b.flight = null;
  // The keeper gets to the ball's line.
  k.pos = clampPitch({ x: toPitch(k.team, { x: 0.7, y: 0 }).x, y: clamp(plan.lineY, WIDTH / 2 - GOAL_HALF, WIDTH / 2 + GOAL_HALF) });
  if (plan.held) {
    b.owner = k.idx;
    b.lastTouch = k.idx;
    b.pos = { ...k.pos };
    b.vel = { x: 0, y: 0 };
    k.cooldown = 8;
  } else {
    b.pos = add(k.pos, { x: dir(k.team) * 0.9, y: 0 });
    b.vel = mul(norm({ x: dir(k.team), y: rand(rng) * 2 - 1 }), 0.7);
    b.lastTouch = k.idx;
    b.noTouchBy = k.idx;
    b.noTouchUntil = s.tick + 5;
  }
}

function scoreGoal(s: MatchState, team: 0 | 1) {
  s.score[team]++;
  s.stats[team].goals++;
  const scorer = s.shot?.shooter ?? (s.ball.lastTouch >= 0 && teamOf(s.ball.lastTouch) === team ? s.ball.lastTouch : -1);
  const scorerIdx = scorer >= 0 ? scorer : s.players.find((p) => p.team === team && p.slot !== 0)!.idx;
  const assist = s.lastPasser[team] >= 0 && s.lastPasser[team] !== scorerIdx ? s.lastPasser[team] : null;
  s.events.push({ t: s.tick, type: "goal", by: scorerIdx, assist, team, score: [...s.score] as [number, number] });
  s.lastPasser = [-1, -1];
  s.shot = null;
  s.ball.flight = null;
  s.ball.owner = -1;
  s.ball.vel = { x: 0, y: 0 };
  s.phase = "goal";
  s.phaseUntil = s.tick + 25;
  s.kickoffTeam = team === 0 ? 1 : 0;
}

/** Changes a team's tactics mid-match (manager instruction or AI manager). */
export function applyTactics(s: MatchState, team: 0 | 1, t: Tactics, reason: string, byAI: boolean) {
  const prev = s.tactics[team];
  if (JSON.stringify(prev) === JSON.stringify(t)) return;
  s.tactics[team] = { ...t };
  if (prev.formation !== t.formation) assignSlots(s, team);
  s.events.push({ t: s.tick, type: "tactics", team, tactics: { ...t }, reason, byAI });
}

export const cloneMatch = (s: MatchState): MatchState => structuredClone(s);

/** Plays a whole match instantly (server checks, tests, balance runs). */
export function simulate(config: MatchConfig, startTactics?: [Tactics | null, Tactics | null], inputs: TacticsInput[] = []): MatchState {
  const s = createMatch(config, startTactics);
  let guard = 0;
  while (s.phase !== "fulltime" && guard++ < config.halfTicks * 4) step(s, inputs);
  return s;
}

/** Game clock shown to players: a 40-minute match. */
export function matchMinute(s: MatchState): number {
  return Math.min(40, Math.floor((s.tick / (2 * s.config.halfTicks)) * 40));
}
