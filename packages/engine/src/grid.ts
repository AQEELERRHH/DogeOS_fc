import type { Action, Vec } from "./types";

/** Tile values stored in the grid. */
export const FLOOR = 0;
export const WALL = 1;
/** Crystallised Echo Trail: blocks agent and enemies until it decays or is bombed. */
export const TRAIL = 2;
/** Closed by a maze collapse. Permanent. */
export const COLLAPSED = 3;

export interface Dir {
  action: Action;
  dx: number;
  dy: number;
}

/** Fixed order = deterministic tie-breaking everywhere. */
export const DIRS: readonly Dir[] = [
  { action: "MOVE_UP", dx: 0, dy: -1 },
  { action: "MOVE_RIGHT", dx: 1, dy: 0 },
  { action: "MOVE_DOWN", dx: 0, dy: 1 },
  { action: "MOVE_LEFT", dx: -1, dy: 0 },
];

export const MOVE_DELTA: Partial<Record<Action, Vec>> = {
  MOVE_UP: { x: 0, y: -1 },
  MOVE_DOWN: { x: 0, y: 1 },
  MOVE_LEFT: { x: -1, y: 0 },
  MOVE_RIGHT: { x: 1, y: 0 },
};

export const idx = (w: number, x: number, y: number) => y * w + x;
export const toVec = (w: number, i: number): Vec => ({ x: i % w, y: Math.floor(i / w) });
export const same = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y;
export const manhattan = (a: Vec, b: Vec) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const chebyshev = (a: Vec, b: Vec) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const inBounds = (w: number, h: number, x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

/** Indices of the 4-neighbours of cell i that are inside the grid. */
export function neighbours(w: number, h: number, i: number): number[] {
  const x = i % w;
  const y = (i - x) / w;
  const out: number[] = [];
  for (const d of DIRS) {
    const nx = x + d.dx;
    const ny = y + d.dy;
    if (inBounds(w, h, nx, ny)) out.push(idx(w, nx, ny));
  }
  return out;
}
