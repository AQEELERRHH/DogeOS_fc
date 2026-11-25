import { Rng, seedFromString } from "./rng";
import type { MatchState } from "./sim";
import { matchMinute } from "./sim";
import { describeTactics } from "./tactics";
import type { MatchEvent } from "./types";

export interface CommentaryLine {
  t: number;
  minute: number;
  text: string;
  tone: "goal" | "chance" | "info" | "tactic" | "whistle";
  team: 0 | 1 | null;
}

const pick = (rng: Rng, xs: string[]) => xs[rng.next() % xs.length];

/**
 * Rule-based commentary. Deterministic: the same events always produce the same lines.
 * Only notable moments get a line (no running pass-by-pass commentary).
 */
export function commentate(s: MatchState, events: MatchEvent[]): CommentaryLine[] {
  const out: CommentaryLine[] = [];
  const name = (i: number) => s.players[i].def.name;
  const club = (t: 0 | 1) => (t === 0 ? s.config.home : s.config.away).name;
  const teamOf = (i: number) => s.players[i].team;
  for (const e of events) {
    const rng = new Rng(seedFromString(`${s.config.seed}|${e.t}|${e.type}`));
    const minute = Math.min(40, Math.floor((e.t / (2 * s.config.halfTicks)) * 40));
    const L = (text: string, tone: CommentaryLine["tone"], team: 0 | 1 | null) => out.push({ t: e.t, minute, text, tone, team });
    switch (e.type) {
      case "kickoff":
        if (e.t === 0) L(`We're under way! ${club(e.team)} kick off.`, "whistle", e.team);
        break;
      case "goal": {
        const a = e.assist !== null ? pick(rng, [` Lovely ball from ${name(e.assist)}.`, ` ${name(e.assist)} with the assist.`, ` Set up by ${name(e.assist)}.`]) : "";
        L(
          `${pick(rng, ["GOAL!", "GOAL! GOAL!", "IT'S IN!"])} ${pick(rng, [
            `${name(e.by)} finds the corner`,
            `${name(e.by)} smashes it home`,
            `${name(e.by)} keeps calm and slots it in`,
            `${name(e.by)} fires past the keeper`,
          ])} for ${club(e.team)}!${a} ${s.config.home.short} ${e.score[0]}–${e.score[1]} ${s.config.away.short}.`,
          "goal",
          e.team,
        );
        break;
      }
      case "save":
        L(
          e.held
            ? pick(rng, [`Good hands from ${name(e.by)}, who gathers ${name(e.shooter)}'s effort.`, `${name(e.by)} holds on to it. Comfortable.`])
            : pick(rng, [`What a save! ${name(e.by)} gets a strong hand to ${name(e.shooter)}'s shot.`, `${name(e.by)} parries it away! Big stop.`]),
          "chance",
          teamOf(e.by),
        );
        break;
      case "miss":
        L(pick(rng, [`${name(e.by)} drags it wide.`, `Off target from ${name(e.by)}.`, `${name(e.by)} should have hit the target there.`]), "chance", teamOf(e.by));
        break;
      case "shot":
        if (e.dist >= 13 && e.onTarget) L(`${name(e.by)} tries his luck from ${e.dist} metres…`, "chance", teamOf(e.by));
        break;
      case "tackle":
        if (rng.next() % 3 === 0) L(pick(rng, [`Strong tackle from ${name(e.by)}.`, `${name(e.by)} wins it back from ${name(e.on)}.`, `Timed perfectly by ${name(e.by)}.`]), "info", teamOf(e.by));
        break;
      case "interception":
        if (rng.next() % 3 === 0) L(pick(rng, [`${name(e.by)} reads it and intercepts.`, `Cut out by ${name(e.by)}.`]), "info", teamOf(e.by));
        break;
      case "dribble":
        if (rng.next() % 4 === 0) L(pick(rng, [`${name(e.by)} skips past ${name(e.past)}!`, `Lovely footwork from ${name(e.by)}, ${name(e.past)} is left behind.`]), "info", teamOf(e.by));
        break;
      case "tactics":
        L(
          e.byAI
            ? `Tactical change from ${club(e.team)}: ${describeTactics(e.tactics)} (${e.reason}).`
            : `${club(e.team)} switch to ${describeTactics(e.tactics)}.`,
          "tactic",
          e.team,
        );
        break;
      case "halftime":
        L(`Half-time: ${s.config.home.name} ${e.score[0]}–${e.score[1]} ${s.config.away.name}.`, "whistle", null);
        break;
      case "fulltime": {
        const [h, a] = e.score;
        const verdict = h === a ? "It ends level." : `${h > a ? s.config.home.name : s.config.away.name} take the win.`;
        L(`Full-time! ${s.config.home.name} ${h}–${a} ${s.config.away.name}. ${verdict}`, "whistle", null);
        break;
      }
    }
  }
  return out;
}

export { matchMinute };
