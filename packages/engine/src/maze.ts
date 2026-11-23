import type { MatchConfig } from "./config";
import { FLOOR, WALL, idx, inBounds, neighbours, toVec } from "./grid";
import { bfs } from "./pathfinding";
import { Rng } from "./rng";
import type { Vec } from "./types";

export interface MazeLayout {
  width: number;
  height: number;
  grid: number[];
  start: Vec;
  exit: Vec;
  crystals: Vec[];
  bonuses: Vec[];
  sentinelRoutes: Vec[][];
  seekerSpawns: Vec[];
}

const CARVE = [
  [0, -2],
  [2, 0],
  [0, 2],
  [-2, 0],
] as const;

/** Generates THE GRID deterministically from config + rng. */
export function generateMaze(config: MatchConfig, rng: Rng): MazeLayout {
  const w = config.width | 1;
  const h = config.height | 1;
  const grid = new Array<number>(w * h).fill(WALL);
  const open = (i: number) => grid[i] !== WALL;

  // 1. Perfect maze via iterative recursive backtracker on odd cells.
  const stack: [number, number][] = [[1, 1]];
  grid[idx(w, 1, 1)] = FLOOR;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const options = CARVE.filter(([dx, dy]) => {
      const nx = cx + dx;
      const ny = cy + dy;
      return nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && grid[idx(w, nx, ny)] === WALL;
    });
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = rng.pick(options);
    grid[idx(w, cx + dx / 2, cy + dy / 2)] = FLOOR;
    grid[idx(w, cx + dx, cy + dy)] = FLOOR;
    stack.push([cx + dx, cy + dy]);
  }

  // 2. Braid: open some dead ends into loops. The Echo Trail makes pure tree mazes deadly.
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      const i = idx(w, x, y);
      const openN = neighbours(w, h, i).filter(open).length;
      if (openN !== 1 || rng.int(100) >= config.braid) continue;
      const walls = CARVE.filter(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && grid[idx(w, x + dx / 2, y + dy / 2)] === WALL;
      });
      if (walls.length) {
        const [dx, dy] = rng.pick(walls);
        grid[idx(w, x + dx / 2, y + dy / 2)] = FLOOR;
      }
    }
  }

  const floorCells: number[] = [];
  for (let i = 0; i < w * h; i++) if (grid[i] === FLOOR) floorCells.push(i);

  // 3. Start top-left, exit at the farthest reachable cell.
  const start: Vec = { x: 1, y: 1 };
  const sI = idx(w, 1, 1);
  const fromStart = bfs(w, h, [sI], open);
  let exitI = sI;
  for (const i of floorCells) if (fromStart[i] > fromStart[exitI]) exitI = i;
  const exit = toVec(w, exitI);
  const maxDist = fromStart[exitI];

  // 4. Spread crystals: greedily maximise distance from start, exit and each other.
  const minDist = new Int32Array(w * h);
  const fromExit = bfs(w, h, [exitI], open);
  for (const i of floorCells) minDist[i] = Math.min(fromStart[i], fromExit[i]);
  const taken = new Set<number>([sI, exitI]);

  const spreadPick = (count: number, topK: number): Vec[] => {
    const out: Vec[] = [];
    for (let k = 0; k < count; k++) {
      const ranked = floorCells
        .filter((i) => !taken.has(i))
        .sort((a, b) => minDist[b] - minDist[a] || a - b)
        .slice(0, topK);
      if (!ranked.length) break;
      const pick = rng.pick(ranked);
      taken.add(pick);
      out.push(toVec(w, pick));
      const d = bfs(w, h, [pick], open);
      for (const i of floorCells) minDist[i] = Math.min(minDist[i], d[i]);
    }
    return out;
  };

  const crystals = spreadPick(3, 4);
  const bonuses = spreadPick(config.bonusItems, 12);

  // 5. Sentinel patrol routes along straight corridors, away from the start.
  const sentinelRoutes: Vec[][] = [];
  const routeCells = new Set<number>();
  const candidates = rng.shuffle(floorCells.filter((i) => fromStart[i] >= 8 && !taken.has(i)));
  for (const c of candidates) {
    if (sentinelRoutes.length >= config.sentinels) break;
    if (routeCells.has(c)) continue;
    const { x, y } = toVec(w, c);
    const run = (dx: number, dy: number) => {
      const cells: Vec[] = [];
      let sx = x;
      let sy = y;
      while (inBounds(w, h, sx - dx, sy - dy) && grid[idx(w, sx - dx, sy - dy)] === FLOOR) {
        sx -= dx;
        sy -= dy;
      }
      while (inBounds(w, h, sx, sy) && grid[idx(w, sx, sy)] === FLOOR && cells.length < 7) {
        cells.push({ x: sx, y: sy });
        sx += dx;
        sy += dy;
      }
      return cells;
    };
    const horiz = run(1, 0);
    const vert = run(0, 1);
    const route = horiz.length >= vert.length ? horiz : vert;
    if (route.length < 3) continue;
    if (route.some((v) => routeCells.has(idx(w, v.x, v.y)) || fromStart[idx(w, v.x, v.y)] < 6)) continue;
    // Never patrol a corridor that is the only way somewhere: there must be a route around it.
    const blocked = new Set([...routeCells, ...route.map((v) => idx(w, v.x, v.y))]);
    const around = bfs(w, h, [sI], (i) => open(i) && !blocked.has(i));
    if (floorCells.some((i) => !blocked.has(i) && around[i] < 0)) continue;
    route.forEach((v) => routeCells.add(idx(w, v.x, v.y)));
    sentinelRoutes.push(route);
  }

  // 6. Seekers spawn in the far half of the maze.
  const far = floorCells.filter((i) => fromStart[i] >= Math.floor(maxDist * 0.6) && i !== exitI);
  const seekerSpawns: Vec[] = [];
  const pool = rng.shuffle(far.length ? far : floorCells.filter((i) => i !== sI));
  for (let k = 0; k < config.seekers; k++) seekerSpawns.push(toVec(w, pool[k % pool.length]));

  return { width: w, height: h, grid, start, exit, crystals, bonuses, sentinelRoutes, seekerSpawns };
}
