import { STYLE_TACTICS } from "./clubs";
import type { MatchState } from "./sim";
import { applyTactics } from "./sim";
import type { Level3, Mentality, Tactics } from "./types";

const lvl = (n: number) => Math.max(0, Math.min(2, n)) as Level3;
const men = (n: number) => Math.max(0, Math.min(4, n)) as Mentality;

/**
 * Rule-based AI manager. Every ~20 match-seconds (and at half-time) it reads the
 * score, the clock and the opponent's approach, then adjusts its own tactics.
 */
export function aiManagerUpdate(s: MatchState, halftime = false) {
  if (!halftime && s.tick % 200 !== 0) return;
  if (s.tick === 0) return;
  for (const team of [0, 1] as const) {
    if (!s.config.aiControls[team]) continue;
    const club = team === 0 ? s.config.home : s.config.away;
    const base = STYLE_TACTICS[club.style];
    const opp = team === 0 ? 1 : 0;
    const diff = s.score[team] - s.score[opp];
    const progress = s.tick / (2 * s.config.halfTicks);
    const oppTactics = s.tactics[opp];
    const total = s.window[0] + s.window[1];
    const oppShare = total > 0 ? s.window[opp] / total : 0.5;

    const next: Tactics = { ...base };
    const reasons: string[] = [];

    if (diff < 0 && progress > 0.4) {
      next.mentality = men(base.mentality + (diff <= -2 ? 2 : 1));
      next.pressing = lvl(base.pressing + 1);
      if (next.formation === "3-1") next.formation = "2-1-1";
      if (diff <= -2 && progress > 0.6) next.formation = "1-1-2";
      reasons.push(diff <= -2 ? "chasing the game" : "pushing for an equaliser");
    } else if (diff > 0 && progress > 0.6) {
      next.mentality = men(base.mentality - (diff >= 2 ? 2 : 1));
      next.pressing = lvl(base.pressing - 1);
      if (diff >= 2 && progress > 0.75) next.formation = "3-1";
      reasons.push("protecting the lead");
    }

    // Read the opponent.
    if (oppShare > 0.62 && club.style !== "fortress" && diff <= 0) {
      next.pressing = lvl(next.pressing + 1);
      reasons.push("pressing to win the ball back");
    }
    if (oppTactics.pressing === 2 && next.passing < 2) {
      next.passing = lvl(next.passing + 1);
      reasons.push("going direct to beat the press");
    }
    if ((oppTactics.formation === "1-1-2" || oppTactics.mentality >= 3) && diff >= 0 && next.formation !== "3-1") {
      next.formation = next.formation === "1-1-2" ? "2-1-1" : next.formation === "1-2-1" ? "2-1-1" : next.formation;
      reasons.push("adding a defender against their attack");
    }

    if (JSON.stringify(next) !== JSON.stringify(s.tactics[team])) {
      applyTactics(s, team, next, reasons.join(", ") || "back to the game plan", true);
    }
  }
  s.window = [0, 0];
}
