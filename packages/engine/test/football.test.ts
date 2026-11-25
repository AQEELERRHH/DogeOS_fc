import { describe, expect, it } from "vitest";
import { CLUBS, LENGTH, WIDTH, commentate, createMatch, simulate, step, type MatchConfig, type TacticsInput } from "../src/index";
import { drillCost, runDrill, pointsForResult, applyCall, applyControl, CALLS_PER_HALF, type MatchInput } from "../src/index";

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

  it("still reaches half-time and full-time when a goal is celebrated across the whistle", () => {
    const s = createMatch(cfg("stoppage"));
    const H = s.config.halfTicks;
    s.tick = H - 5;
    s.phase = "goal";
    s.phaseUntil = s.tick + 25;
    while (s.tick < H + 2) step(s);
    expect(s.events.filter((e) => e.type === "halftime")).toHaveLength(1);
    expect(s.phase).toBe("halftime");
    s.tick = 2 * H - 5;
    s.phase = "goal";
    s.phaseUntil = s.tick + 25;
    let guard = 0;
    while ((s.phase as string) !== "fulltime" && guard++ < 50) step(s);
    expect(s.phase).toBe("fulltime");
    expect(s.events.filter((e) => e.type === "fulltime")).toHaveLength(1);
  });

  it("produces commentary for goals and the final whistle", () => {
    const s = createMatch(cfg("comm"));
    while (s.phase !== "fulltime") step(s);
    const lines = commentate(s, s.events);
    expect(lines.filter((l) => l.tone === "goal").length).toBe(s.score[0] + s.score[1]);
    expect(lines[lines.length - 1].text).toMatch(/Full-time/);
  });
});


describe("training and roles", () => {
  it("drills cost more as players improve and stop at the cap", () => {
    expect(drillCost(50)).toBe(1);
    expect(drillCost(70)).toBe(2);
    expect(drillCost(80)).toBe(3);
    expect(drillCost(88)).toBe(4);
    expect(drillCost(90)).toBeNull();
    const kanu = CLUBS[0].squad[4];
    const r = runDrill(kanu, "finishing", 10)!;
    expect(r.player.attrs.shooting).toBe(kanu.attrs.shooting + 1);
    expect(r.cost).toBe(2);
    expect(runDrill(kanu, "shot-stopping", 10)).toBeNull();
    expect(runDrill(kanu, "finishing", 1)).toBeNull();
  });

  it("awards points for results", () => {
    expect(pointsForResult(2, 0)).toBe(4);
    expect(pointsForResult(2, 1)).toBe(3);
    expect(pointsForResult(1, 1)).toBe(2);
    expect(pointsForResult(0, 3)).toBe(1);
  });

  it("a player's style changes how he plays", () => {
    const base = CLUBS[0];
    const opp = CLUBS[3];
    const count = (style: "poacher" | "target") => {
      const club = { ...base, squad: base.squad.map((p, i) => (i === 4 ? { ...p, style } : p)) };
      let shots = 0;
      let passes = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const s = simulate({ seed: `role:${seed}`, home: club, away: opp, halfTicks: 900, aiControls: [false, true] });
        for (const e of s.events) {
          if (e.type === "shot" && e.by === 4) shots++;
          if (e.type === "pass" && e.from === 4) passes++;
        }
      }
      return { shots, passes };
    };
    const p = count("poacher");
    const t = count("target");
    expect(p.shots).toBeGreaterThan(t.shots);
    expect(t.passes).toBeGreaterThan(p.passes);
  });
});

describe("touchline calls and player-manager mode", () => {
  it("limits calls per half and resets them at half-time", () => {
    const s = createMatch(cfg("calls", [false, true]));
    expect(applyCall(s, 0, "shoot")).toBe(true);
    expect(applyCall(s, 0, "press")).toBe(true);
    expect(applyCall(s, 0, "keep")).toBe(true);
    expect(applyCall(s, 0, "attack")).toBe(false);
    expect(s.callsLeft[0]).toBe(0);
    while (s.tick < 905) step(s);
    expect(s.callsLeft[0]).toBe(CALLS_PER_HALF);
  });

  it("replays exactly with calls and control inputs", () => {
    const inputs: MatchInput[] = [
      { t: 50, team: 0, call: "shoot" },
      { t: 120, team: 0, player: 4, move: { x: 1, y: 0 } },
      { t: 160, team: 0, player: 4, move: { x: 1, y: 0 }, action: "shoot" },
      { t: 200, team: 0, player: 4, move: { x: 0, y: 0 } },
      { t: 400, team: 0, call: "press" },
      { t: 600, team: 0, player: -1, move: { x: 0, y: 0 } },
    ];
    const a = simulate(cfg("replay-in", [false, true]), undefined, inputs);
    const b = simulate(cfg("replay-in", [false, true]), undefined, inputs);
    expect(a.score).toEqual(b.score);
    expect(a.events.length).toBe(b.events.length);
    expect(JSON.stringify(a.stats)).toBe(JSON.stringify(b.stats));
  });

  it("'shoot on sight' produces more shots", () => {
    let plain = 0;
    let shooting = 0;
    for (let i = 0; i < 25; i++) {
      const calls: MatchInput[] = [0, 300, 600, 950, 1250, 1550].map((t) => ({ t, team: 0 as const, call: "shoot" as const }));
      plain += simulate(cfg(`sos-${i}`, [false, true])).stats[0].shots;
      shooting += simulate(cfg(`sos-${i}`, [false, true]), undefined, calls).stats[0].shots;
    }
    expect(shooting).toBeGreaterThan(plain * 1.04);
  });

  it("a controlled player goes where he's told and shoots when asked", () => {
    const s = createMatch(cfg("ctl", [false, true]));
    while (s.phase !== "play") step(s);
    const me = s.players[4];
    // Give him the ball near the box and point him at goal.
    s.ball.owner = me.idx;
    me.pos = { x: LENGTH - 9, y: WIDTH / 2 };
    me.cooldown = 0;
    applyControl(s, { team: 0, player: me.idx, move: { x: 1, y: 0 } });
    const x0 = me.pos.x;
    for (let i = 0; i < 4; i++) step(s);
    expect(me.pos.x).toBeGreaterThan(x0);
    applyControl(s, { team: 0, player: me.idx, move: { x: 1, y: 0 }, action: "shoot" });
    let shot = false;
    for (let i = 0; i < 6 && !shot; i++) {
      step(s);
      shot = s.events.some((e) => e.type === "shot" && e.by === me.idx);
    }
    expect(shot).toBe(true);
  });

  it("goalkeepers can't be controlled", () => {
    const s = createMatch(cfg("gk", [false, true]));
    applyControl(s, { team: 0, player: 0, move: { x: 1, y: 0 } });
    expect(s.control[0]).toBeNull();
  });
});
