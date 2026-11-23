import { describe, expect, it } from "vitest";
import {
  COLLAPSED,
  FLOOR,
  MAX_WEIGHT,
  MIN_WEIGHT,
  PERSONALITIES,
  Rng,
  TRAIL,
  activePolicy,
  applyCoaching,
  buildConfig,
  chooseCollapse,
  createGame,
  dailyConfig,
  decide,
  idx,
  interpretCoaching,
  isSolvable,
  learnFromMatch,
  newPolicyHistory,
  replayFinal,
  rollback,
  runEndless,
  runMatch,
  step,
  type Personality,
} from "../src/index";

const policy = (p: Personality = "explorer") => activePolicy(newPolicyHistory(p));

describe("maze generation", () => {
  it("is deterministic per seed and different across seeds", () => {
    const a = createGame(buildConfig({ mode: "training", seed: "alpha" }));
    const b = createGame(buildConfig({ mode: "training", seed: "alpha" }));
    const c = createGame(buildConfig({ mode: "training", seed: "beta" }));
    expect(a.grid).toEqual(b.grid);
    expect(a.crystals).toEqual(b.crystals);
    expect(a.grid).not.toEqual(c.grid);
  });

  it("always has 3 reachable crystals, a reachable exit and enemies, across levels", () => {
    for (let i = 0; i < 40; i++) {
      const level = 1 + (i % 12);
      const s = createGame(buildConfig({ mode: "training", seed: `gen:${i}`, level }));
      expect(s.crystals).toHaveLength(3);
      expect(isSolvable(s, s.start)).toBe(true);
      expect(s.enemies.filter((e) => e.kind === "seeker").length).toBe(s.config.seekers);
      expect(s.enemies.filter((e) => e.kind === "sentinel").length).toBeGreaterThan(0);
    }
  });

  it("daily maze is identical for everyone on the same date", () => {
    expect(createGame(dailyConfig("2026-11-23")).grid).toEqual(createGame(dailyConfig("2026-11-23")).grid);
    expect(() => dailyConfig("23/11/2026")).toThrow();
  });
});

describe("Echo Trail", () => {
  it("keeps the two most recent trail tiles passable and crystallises older ones, which later dissolve", () => {
    const s = createGame(buildConfig({ mode: "training", seed: "trail" }));
    s.enemies = []; // isolate the mechanic
    s.nextCollapseAt = 10_000;
    const visited = [{ ...s.agent.pos }];
    // Walk any open path for 3 moves without revisiting.
    for (let k = 0; k < 3; k++) {
      const { x, y } = s.agent.pos;
      const moves = [
        ["MOVE_UP", x, y - 1],
        ["MOVE_RIGHT", x + 1, y],
        ["MOVE_DOWN", x, y + 1],
        ["MOVE_LEFT", x - 1, y],
      ] as const;
      const m = moves.find(([, nx, ny]) => s.grid[idx(s.width, nx, ny)] === FLOOR && !visited.some((v) => v.x === nx && v.y === ny));
      expect(m).toBeDefined();
      step(s, m![0]);
      visited.push({ ...s.agent.pos });
    }
    const first = visited[0];
    expect(s.grid[idx(s.width, first.x, first.y)]).toBe(TRAIL);
    expect(s.agent.trail).toHaveLength(2);
    for (const t of s.agent.trail) expect(s.grid[idx(s.width, t.x, t.y)]).toBe(FLOOR);
    for (let k = 0; k < s.config.trailLifetime + 1; k++) step(s, "WAIT");
    expect(s.grid[idx(s.width, first.x, first.y)]).toBe(FLOOR);
  });
});

describe("pulse bombs", () => {
  it("clear nearby crystallised trail, stun enemies in range and score stuns", () => {
    const s = createGame(buildConfig({ mode: "training", seed: "bomb" }));
    const { x, y } = s.agent.pos;
    const target = idx(s.width, x + 1, y);
    s.grid[target] = TRAIL;
    s.trailExpiry.push({ i: target, until: 999 });
    s.enemies[0].pos = { x: x + 2, y };
    s.enemies[0].stunnedUntil = 0;
    step(s, "USE_BOMB");
    expect(s.grid[target]).toBe(FLOOR);
    expect(s.enemies[0].stunnedUntil).toBeGreaterThan(s.tick);
    expect(s.agent.bombs).toBe(1);
    expect(s.score.stuns).toBe(50);
    expect(s.stats.bombsWasted).toBe(0);
  });
});

describe("maze collapse", () => {
  it("never picks a segment that makes the maze unsolvable", () => {
    for (let i = 0; i < 30; i++) {
      const s = createGame(buildConfig({ mode: "training", seed: `collapse:${i}`, level: 1 + (i % 10) }));
      const c = chooseCollapse(s, new Rng(i + 1));
      if (!c) continue;
      const blocked = new Set(c.cells.map((v) => idx(s.width, v.x, v.y)));
      expect(isSolvable(s, s.agent.pos, blocked)).toBe(true);
      expect(c.at).toBe(s.tick + s.config.collapseWarning);
    }
  });

  it("collapses happen during real matches and the maze stays solvable for a living agent", () => {
    let collapses = 0;
    for (let i = 0; i < 15; i++) {
      const s = createGame(buildConfig({ mode: "training", seed: `live:${i}`, level: 6 }));
      const p = policy("survivor");
      while (s.status === "running") {
        const before = s.events.length;
        step(s, decide(s, p).action);
        if (s.events.slice(before).some((e) => e.type === "collapse")) {
          collapses++;
          expect(s.grid.some((t) => t === COLLAPSED)).toBe(true);
          if (s.status === "running") expect(isSolvable(s, s.agent.pos)).toBe(true);
        }
      }
    }
    expect(collapses).toBeGreaterThan(0);
  });
});

describe("autonomous matches", () => {
  it("are fully deterministic (same config + policy ⇒ same replay hash)", () => {
    const cfg = buildConfig({ mode: "training", seed: "det", level: 4 });
    const a = runMatch(cfg, policy("aggressive"));
    const b = runMatch(cfg, policy("aggressive"));
    expect(a.replayHash).toBe(b.replayHash);
    expect(a.replayHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(a.score).toEqual(b.score);
  });

  it("replaying recorded actions reproduces the exact result (server can verify)", () => {
    const cfg = buildConfig({ mode: "training", seed: "replay", level: 3 });
    const r = runMatch(cfg, policy());
    const final = replayFinal(cfg, r.actions);
    expect(final.status).toBe(r.status);
    expect(final.score.total).toBe(r.score.total);
  });

  it("always terminate within maxTicks and every decision has an explanation", () => {
    for (let i = 0; i < 12; i++) {
      const r = runMatch(buildConfig({ mode: "training", seed: `term:${i}`, level: 1 + i }), policy());
      expect(r.stats.ticks).toBeLessThanOrEqual(r.config.maxTicks);
      expect(r.decisions.every((d) => d.reason.length > 10)).toBe(true);
    }
  });

  it("escape a solid share of level-1 mazes", () => {
    let escapes = 0;
    for (let i = 0; i < 20; i++) if (runMatch(buildConfig({ mode: "training", seed: `easy:${i}` }), policy()).status === "escaped") escapes++;
    expect(escapes).toBeGreaterThanOrEqual(12);
  });

  it("personalities behave differently on the same maze", () => {
    const cfg = buildConfig({ mode: "training", seed: "persona", level: 3 });
    const hashes = new Set((Object.keys(PERSONALITIES) as Personality[]).map((p) => runMatch(cfg, policy(p)).actions));
    expect(hashes.size).toBeGreaterThan(1);
  });

  it("scoring follows the spec", () => {
    const cfg = buildConfig({ mode: "training", seed: "score:3" });
    for (let i = 0; i < 10; i++) {
      const r = runMatch(buildConfig({ mode: "training", seed: `score:${i}` }), policy());
      const s = r.score;
      expect(s.crystals).toBe(100 * r.stats.crystals);
      expect(s.bonuses).toBe(25 * r.stats.bonuses);
      expect(s.stuns).toBe(50 * r.stats.enemiesStunned);
      if (r.status === "escaped") {
        expect(s.escape).toBe(250);
        expect(s.noDamage).toBe(r.stats.damageTaken === 0 ? 200 : 0);
        expect(s.speed).toBeLessThanOrEqual(150);
      } else expect(s.escape + s.noDamage + s.speed).toBe(0);
      expect(s.total).toBe(s.crystals + s.bonuses + s.escape + s.stuns + s.noDamage + s.speed);
    }
    expect(cfg.maxTicks).toBe(600);
  });

  it("Endless Grid carries HP between floors and stops at the first failure", () => {
    const e = runEndless("endless-test", policy("survivor"), 1, 6);
    expect(e.floors.length).toBeGreaterThan(0);
    const lastIdx = e.floors.length - 1;
    e.floors.slice(0, lastIdx).forEach((f) => expect(f.status).toBe("escaped"));
    expect(e.floorsCleared).toBeLessThanOrEqual(e.floors.length);
  });
});

describe("learning", () => {
  it("only adopts bounded changes that beat the current strategy on remembered mazes, with an explanation", () => {
    let h = newPolicyHistory("speedrunner");
    let mem: Parameters<typeof learnFromMatch>[2] = [];
    for (let m = 0; m < 3; m++) {
      const before = activePolicy(h);
      const r = runMatch(buildConfig({ mode: "training", seed: `learn:${m}`, level: 3 }), before);
      const out = learnFromMatch(h, r, mem, [], 6);
      expect(out.report.explanation.length).toBeGreaterThan(20);
      if (out.version) {
        const ch = out.version.changes[0];
        expect(Math.abs((ch.to as number) - (ch.from as number))).toBeLessThanOrEqual(15);
        expect(out.report.adopted!.escapes > out.report.baseline.escapes || out.report.adopted!.score > out.report.baseline.score).toBe(true);
        expect(out.version.parent).toBe(before.version);
      }
      h = out.history;
      mem = out.memory;
    }
    for (const v of h.versions) for (const w of Object.values(v.weights)) expect(w).toBeGreaterThanOrEqual(MIN_WEIGHT), expect(w).toBeLessThanOrEqual(MAX_WEIGHT);
  });

  it("rollback creates a new version restoring older weights (history is append-only)", () => {
    let h = newPolicyHistory("explorer");
    h = applyCoaching(h, "Avoid enemies whenever possible").history;
    const coached = activePolicy(h);
    h = rollback(h, 1);
    const now = activePolicy(h);
    expect(now.weights).toEqual(PERSONALITIES.explorer.weights);
    expect(now.source).toBe("rollback");
    expect(h.versions.map((v) => v.version)).toEqual([1, coached.version, coached.version + 1]);
  });
});

describe("coaching", () => {
  it("understands the spec examples", () => {
    const cases: [string, string, number][] = [
      ["Avoid enemies whenever possible.", "survival", 1],
      ["Stop wasting bombs.", "resourcefulness", 1],
      ["Prioritise collecting crystals.", "efficiency", 1],
      ["Choose shorter routes.", "efficiency", 1],
      ["Focus more on survival.", "survival", 1],
      ["Don't explore so much", "exploration", -1],
    ];
    for (const [text, dim, sign] of cases) {
      const i = interpretCoaching(text);
      expect(i.intents.length, text).toBeGreaterThan(0);
      expect(Math.sign(i.intents[0].effects[dim as "survival"] ?? 0), text).toBe(sign);
    }
    const corridor = interpretCoaching("Don't enter narrow corridors when the Seeker is nearby.");
    expect(corridor.intents[0].corridorCaution).toBe(true);
  });

  it("records what was understood, what changed, and ignores what it can't map", () => {
    const h0 = newPolicyHistory("aggressive");
    const { history, version, interpretation } = applyCoaching(h0, "Stop wasting bombs and dance a little jig");
    expect(interpretation.intents.map((i) => i.understood)).toContain("Use bombs more carefully");
    expect(interpretation.ignored.length).toBe(1);
    expect(version!.source).toBe("coaching");
    expect(version!.ref).toBe("Stop wasting bombs and dance a little jig");
    expect(activePolicy(history).weights.resourcefulness).toBe(PERSONALITIES.aggressive.weights.resourcefulness + 6);
    expect(history.versions[0].weights).toEqual(PERSONALITIES.aggressive.weights); // previous version preserved
  });

  it("does nothing for gibberish (no new version)", () => {
    const h0 = newPolicyHistory("survivor");
    const out = applyCoaching(h0, "rm -rf / ; DROP TABLE agents;");
    expect(out.version).toBeNull();
    expect(out.history).toBe(h0);
  });
});
