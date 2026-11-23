import { COLLAPSED, FLOOR, TRAIL, WALL, idx, same } from "./grid";
import type { GameState } from "./sim";

/**
 * ASCII view for the CLI and tests.
 *  # wall   . floor   x crystallised trail   ~ passable trail   X collapsed   ! collapse warning
 *  N NOVA   S seeker  s sentinel (lowercase z = stunned)   * crystal   + bonus   E exit (O when open)
 */
export function renderAscii(s: GameState): string {
  const { width: w, height: h } = s;
  const warn = new Set((s.pendingCollapse?.cells ?? []).map((c) => idx(w, c.x, c.y)));
  const lines: string[] = [];
  for (let y = 0; y < h; y++) {
    let line = "";
    for (let x = 0; x < w; x++) {
      const p = { x, y };
      const i = idx(w, x, y);
      const enemy = s.enemies.find((e) => same(e.pos, p));
      let ch: string;
      if (same(s.agent.pos, p)) ch = "N";
      else if (enemy) ch = s.tick < enemy.stunnedUntil ? "z" : enemy.kind === "seeker" ? "S" : "s";
      else if (s.crystals.some((c) => same(c, p))) ch = "*";
      else if (s.bonuses.some((b) => same(b, p))) ch = "+";
      else if (same(s.exit, p)) ch = s.crystals.length ? "E" : "O";
      else if (warn.has(i)) ch = "!";
      else if (s.agent.trail.some((t) => same(t, p))) ch = "~";
      else {
        const t = s.grid[i];
        ch = t === WALL ? "#" : t === TRAIL ? "x" : t === COLLAPSED ? "X" : t === FLOOR ? "." : "?";
      }
      line += ch;
    }
    lines.push(line);
  }
  const a = s.agent;
  lines.push(
    `tick ${s.tick}/${s.config.maxTicks}  hp ${a.hp}  bombs ${a.bombs}  crystals ${a.collected}/3  score ${s.score.total}  ${s.status}`,
  );
  return lines.join("\n");
}
