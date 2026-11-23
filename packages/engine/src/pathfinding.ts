import { idx, neighbours, toVec } from "./grid";
import type { Vec } from "./types";

export type Passable = (i: number) => boolean;
/** Step cost of entering cell i. Return Infinity for blocked. Integers keep results exact. */
export type CostFn = (i: number) => number;

/** Breadth-first distances from one or more sources. -1 = unreachable. */
export function bfs(w: number, h: number, sources: number[], passable: Passable): Int32Array {
  const dist = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  for (const s of sources) {
    if (dist[s] === -1) {
      dist[s] = 0;
      queue[tail++] = s;
    }
  }
  while (head < tail) {
    const cur = queue[head++];
    for (const n of neighbours(w, h, cur)) {
      if (dist[n] === -1 && passable(n)) {
        dist[n] = dist[cur] + 1;
        queue[tail++] = n;
      }
    }
  }
  return dist;
}

/** Number of cells reachable from `start`, stopping once `limit` is reached. */
export function floodCount(w: number, h: number, start: number, passable: Passable, limit: number): number {
  const seen = new Uint8Array(w * h);
  const stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length && count < limit) {
    const cur = stack.pop()!;
    count++;
    for (const n of neighbours(w, h, cur)) {
      if (!seen[n] && passable(n)) {
        seen[n] = 1;
        stack.push(n);
      }
    }
  }
  return count;
}

/** Binary min-heap keyed by (f, seq) so equal-cost ties resolve identically everywhere. */
class Heap {
  private items: { f: number; seq: number; i: number }[] = [];
  get size() {
    return this.items.length;
  }
  push(f: number, seq: number, i: number) {
    const a = this.items;
    a.push({ f, seq, i });
    let c = a.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.less(a[c], a[p])) {
        [a[c], a[p]] = [a[p], a[c]];
        c = p;
      } else break;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let p = 0;
      for (;;) {
        const l = 2 * p + 1;
        const r = l + 1;
        let m = p;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === p) break;
        [a[m], a[p]] = [a[p], a[m]];
        p = m;
      }
    }
    return top;
  }
  private less(a: { f: number; seq: number }, b: { f: number; seq: number }) {
    return a.f < b.f || (a.f === b.f && a.seq < b.seq);
  }
}

export interface PathResult {
  /** Cells to walk, excluding the start. */
  path: Vec[];
  cost: number;
}

/**
 * Weighted A*. `minStepCost` must be ≤ the cheapest cell cost so the
 * Manhattan heuristic stays admissible.
 */
export function astar(
  w: number,
  h: number,
  from: Vec,
  to: Vec,
  cost: CostFn,
  minStepCost: number,
): PathResult | null {
  const start = idx(w, from.x, from.y);
  const goal = idx(w, to.x, to.y);
  if (start === goal) return { path: [], cost: 0 };

  const g = new Float64Array(w * h).fill(Infinity);
  const came = new Int32Array(w * h).fill(-1);
  const closed = new Uint8Array(w * h);
  const heap = new Heap();
  let seq = 0;
  const hfn = (i: number) => {
    const x = i % w;
    const y = (i - x) / w;
    return (Math.abs(x - to.x) + Math.abs(y - to.y)) * minStepCost;
  };

  g[start] = 0;
  heap.push(hfn(start), seq++, start);

  while (heap.size) {
    const { i: cur } = heap.pop();
    if (closed[cur]) continue;
    if (cur === goal) break;
    closed[cur] = 1;
    for (const n of neighbours(w, h, cur)) {
      if (closed[n]) continue;
      const c = cost(n);
      if (!Number.isFinite(c)) continue;
      const ng = g[cur] + c;
      if (ng < g[n]) {
        g[n] = ng;
        came[n] = cur;
        heap.push(ng + hfn(n), seq++, n);
      }
    }
  }

  if (!Number.isFinite(g[goal])) return null;
  const path: Vec[] = [];
  for (let c = goal; c !== start; c = came[c]) path.push(toVec(w, c));
  path.reverse();
  return { path, cost: g[goal] };
}
