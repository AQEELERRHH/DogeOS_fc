import { describe, expect, it } from "vitest";
import { CLUBS, LENGTH, WIDTH, commentate, createMatch, simulate, step, type MatchConfig, type TacticsInput } from "../src/index";

const cfg = (seed: string, ai: [boolean, boolean] = [true, true]): MatchConfig => ({ seed, home: CLUBS[0], away: CLUBS[3], halfTicks: 900, aiControls: ai });

describe("match engine", () => {
  it("is deterministic: same seed and inputs give the same match", () => {
    const a = simulate(cfg("det"));
    const b = simulate(cfg("det"));
    expect(a.score).toEqual(b.score);
    expect(a.events.length).toBe(b.events.length);
    expect(simulate(cfg("other")).events.length).not.toBe(a.events.length);
  });

  it("always finishes with sane scores and stats", () => {
    for (let i = 0; i < 12; i++) {
      const s = simulate({ ...cfg(`sane:${i}`), away: CLUBS[1 + (i % 4)] });
      expect(s.phase).toBe("fulltime");
      expect(s.score[0] + s.score[1]).toBeLessThan(16);
      expect(s.stats[0].goals).toBe(s.score[0]);
      expect(s.stats[0].passesCompleted).toBeLessThanOrEqual(s.stats[0].passes);
      for (const p of s.players) {
        expect(p.pos.x).toBeGreaterThanOrEqual(0);
        expect(p.pos.x).toBeLessThanOrEqual(LENGTH);
        expect(p.pos.y).toBeGreaterThanOrEqual(0);
        expect(p.pos.y).toBeLessThanOrEqual(WIDTH);
      }
    }
  });

  it("goals in the event log match the scoreline", () => {
    const s = simulate(cfg("goals"));
    const goals = s.events.filter((e) => e.type === "goal");
    expect(goals.length).toBe(s.score[0] + s.score[1]);
  });

  it("manager tactics changes are applied and replayable", () => {
    const inputs: TacticsInput[] = [{ t: 300, team: 0, tactics: { formation: "1-1-2", mentality: 4, pressing: 2, passing: 2, width: 2 } }];
    const a = simulate(cfg("tac", [false, true]), undefined, inputs);
    const b = simulate(cfg("tac", [false, true]), undefined, inputs);
    expect(a.score).toEqual(b.score);
    expect(a.events.some((e) => e.type === "tactics" && e.team === 0 && !e.byAI)).toBe(true);
    expect(a.tactics[0].formation).toBe("1-1-2");
  });

  it("produces commentary for goals and the final whistle", () => {
    const s = createMatch(cfg("comm"));
    while (s.phase !== "fulltime") step(s);
    const lines = commentate(s, s.events);
    expect(lines.filter((l) => l.tone === "goal").length).toBe(s.score[0] + s.score[1]);
    expect(lines[lines.length - 1].text).toMatch(/Full-time/);
  });
});
