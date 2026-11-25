import type { Attributes, PlayerDef, PlayerStyle, Role } from "./types";

/** Playing styles available to each role, with what they change on the pitch. */
export const PLAYER_STYLES: Record<Role, { key: PlayerStyle; label: string; blurb: string }[]> = {
  GK: [
    { key: "line", label: "Shot-stopper", blurb: "Stays on his line. A little better at saves." },
    { key: "sweeper", label: "Sweeper keeper", blurb: "Comes off his line to clear loose balls. Weaker against long shots." },
  ],
  DEF: [
    { key: "stopper", label: "Stopper", blurb: "Steps up and wins more tackles. Leaves space behind." },
    { key: "cover", label: "Cover", blurb: "Sits deeper and throws his body in front of more shots." },
  ],
  MID: [
    { key: "playmaker", label: "Playmaker", blurb: "Sits central, looks for the forward pass, shoots less." },
    { key: "box2box", label: "Box-to-box", blurb: "Bursts forward, joins the press and shoots more." },
  ],
  FWD: [
    { key: "poacher", label: "Poacher", blurb: "Lives on the shoulder of the last man. Sharper finisher in the box." },
    { key: "target", label: "Target man", blurb: "Drops in, holds the ball up and brings others into play." },
  ],
};

export function styleLabel(style: PlayerStyle | undefined): string {
  if (!style) return "Standard";
  for (const list of Object.values(PLAYER_STYLES)) for (const s of list) if (s.key === style) return s.label;
  return "Standard";
}

export interface Drill {
  id: string;
  name: string;
  attr: keyof Attributes;
  /** Which roles can do this drill. */
  roles: Role[];
  blurb: string;
}

export const DRILLS: Drill[] = [
  { id: "finishing", name: "Finishing", attr: "shooting", roles: ["DEF", "MID", "FWD"], blurb: "Shots from every angle." },
  { id: "passing", name: "Rondos", attr: "passing", roles: ["GK", "DEF", "MID", "FWD"], blurb: "Quick passing under pressure." },
  { id: "dribbling", name: "Cone dribbling", attr: "dribbling", roles: ["DEF", "MID", "FWD"], blurb: "Close control at speed." },
  { id: "tackling", name: "1v1 defending", attr: "tackling", roles: ["DEF", "MID", "FWD"], blurb: "Timing the tackle." },
  { id: "positioning", name: "Shape work", attr: "positioning", roles: ["GK", "DEF", "MID", "FWD"], blurb: "Being in the right place." },
  { id: "sprints", name: "Sprints", attr: "pace", roles: ["GK", "DEF", "MID", "FWD"], blurb: "Acceleration and top speed." },
  { id: "fitness", name: "Fitness", attr: "stamina", roles: ["GK", "DEF", "MID", "FWD"], blurb: "Lasting the full match." },
  { id: "shot-stopping", name: "Shot-stopping", attr: "reflexes", roles: ["GK"], blurb: "Reactions and diving." },
];

/** No attribute can be trained past this. */
export const ATTR_CAP = 90;

/** Training points it costs to raise an attribute by one from its current value. Null at the cap. */
export function drillCost(value: number): number | null {
  if (value >= ATTR_CAP) return null;
  if (value < 60) return 1;
  if (value < 75) return 2;
  if (value < 85) return 3;
  return 4;
}

/** How much one session raises the attribute. */
export const DRILL_GAIN = 1;

/** Returns the trained player and the points spent, or null if the drill is not allowed. */
export function runDrill(player: PlayerDef, drillId: string, points: number): { player: PlayerDef; cost: number } | null {
  const drill = DRILLS.find((d) => d.id === drillId);
  if (!drill || !drill.roles.includes(player.role)) return null;
  const value = player.attrs[drill.attr];
  const cost = drillCost(value);
  if (cost === null || cost > points) return null;
  return {
    player: { ...player, attrs: { ...player.attrs, [drill.attr]: Math.min(ATTR_CAP, value + DRILL_GAIN) } },
    cost,
  };
}

/** Training points for a result: win 3, draw 2, loss 1, plus 1 for a clean sheet. */
export function pointsForResult(goalsFor: number, goalsAgainst: number): number {
  const base = goalsFor > goalsAgainst ? 3 : goalsFor === goalsAgainst ? 2 : 1;
  return base + (goalsAgainst === 0 ? 1 : 0);
}

/** A rough overall rating for display. */
export function overall(p: PlayerDef): number {
  const a = p.attrs;
  const w: Record<Role, Partial<Record<keyof Attributes, number>>> = {
    GK: { reflexes: 4, positioning: 3, passing: 1, pace: 1, stamina: 1 },
    DEF: { tackling: 4, positioning: 3, pace: 2, passing: 1, stamina: 1 },
    MID: { passing: 3, dribbling: 2, positioning: 2, pace: 1, shooting: 1, tackling: 1, stamina: 1 },
    FWD: { shooting: 4, pace: 2, dribbling: 2, positioning: 2, passing: 1 },
  };
  let sum = 0;
  let n = 0;
  for (const [k, v] of Object.entries(w[p.role]) as [keyof Attributes, number][]) {
    sum += a[k] * v;
    n += v;
  }
  return Math.round(sum / n);
}
