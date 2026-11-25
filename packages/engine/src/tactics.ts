import type { FormationKey, Role, Tactics, V2 } from "./types";

/** Pitch in metres. Team 0 attacks towards +x (goal at x = LENGTH). */
export const LENGTH = 40;
export const WIDTH = 24;
export const GOAL_HALF = 2.5; // goal is 5 m wide
export const BOX_DEPTH = 6; // keeper's area

export interface FormationDef {
  key: FormationKey;
  name: string;
  description: string;
  /** Outfield slots 1..4, as fractions of the pitch when attacking (x 0 = own goal). */
  slots: { role: Role; x: number; y: number }[];
}

export const FORMATIONS: Record<FormationKey, FormationDef> = {
  "2-2": {
    key: "2-2",
    name: "2-2 Box",
    description: "Two at the back, two up top. Solid and balanced, but thin in midfield.",
    slots: [
      { role: "DEF", x: 0.24, y: 0.3 },
      { role: "DEF", x: 0.24, y: 0.7 },
      { role: "FWD", x: 0.64, y: 0.3 },
      { role: "FWD", x: 0.64, y: 0.7 },
    ],
  },
  "1-2-1": {
    key: "1-2-1",
    name: "1-2-1 Diamond",
    description: "A pivot, two wide midfielders and a striker. Great for passing triangles.",
    slots: [
      { role: "DEF", x: 0.22, y: 0.5 },
      { role: "MID", x: 0.44, y: 0.22 },
      { role: "MID", x: 0.44, y: 0.78 },
      { role: "FWD", x: 0.7, y: 0.5 },
    ],
  },
  "2-1-1": {
    key: "2-1-1",
    name: "2-1-1 Pyramid",
    description: "Two defenders, a playmaker and a lone striker. Safe in possession.",
    slots: [
      { role: "DEF", x: 0.22, y: 0.3 },
      { role: "DEF", x: 0.22, y: 0.7 },
      { role: "MID", x: 0.45, y: 0.5 },
      { role: "FWD", x: 0.7, y: 0.5 },
    ],
  },
  "3-1": {
    key: "3-1",
    name: "3-1 Wall",
    description: "Three defenders and a target striker. Hard to break down, few chances.",
    slots: [
      { role: "DEF", x: 0.2, y: 0.22 },
      { role: "DEF", x: 0.18, y: 0.5 },
      { role: "DEF", x: 0.2, y: 0.78 },
      { role: "FWD", x: 0.62, y: 0.5 },
    ],
  },
  "1-1-2": {
    key: "1-1-2",
    name: "1-1-2 Blitz",
    description: "One defender, one midfielder, two strikers. Scores lots, concedes lots.",
    slots: [
      { role: "DEF", x: 0.24, y: 0.5 },
      { role: "MID", x: 0.44, y: 0.5 },
      { role: "FWD", x: 0.7, y: 0.28 },
      { role: "FWD", x: 0.7, y: 0.72 },
    ],
  },
};

export const MENTALITY_LABEL = ["Very defensive", "Defensive", "Balanced", "Attacking", "Very attacking"] as const;
export const PRESSING_LABEL = ["Low block", "Mid press", "High press"] as const;
export const PASSING_LABEL = ["Short & safe", "Mixed", "Direct"] as const;
export const WIDTH_LABEL = ["Narrow", "Normal", "Wide"] as const;

export const DEFAULT_TACTICS: Tactics = { formation: "1-2-1", mentality: 2, pressing: 1, passing: 1, width: 1 };

/** Converts a team-relative point (x 0 = own goal) to pitch coordinates. */
export function toPitch(team: 0 | 1, rel: V2): V2 {
  return team === 0 ? { x: rel.x, y: rel.y } : { x: LENGTH - rel.x, y: WIDTH - rel.y };
}

/** Attacking direction along x. */
export const dir = (team: 0 | 1) => (team === 0 ? 1 : -1);
/** Centre of the goal this team attacks. */
export const attackGoal = (team: 0 | 1): V2 => ({ x: team === 0 ? LENGTH : 0, y: WIDTH / 2 });
/** Centre of the goal this team defends. */
export const ownGoal = (team: 0 | 1): V2 => ({ x: team === 0 ? 0 : LENGTH, y: WIDTH / 2 });

export function describeTactics(t: Tactics): string {
  return `${FORMATIONS[t.formation].name}, ${MENTALITY_LABEL[t.mentality].toLowerCase()}, ${PRESSING_LABEL[t.pressing].toLowerCase()}, ${PASSING_LABEL[t.passing].toLowerCase()} passing`;
}
