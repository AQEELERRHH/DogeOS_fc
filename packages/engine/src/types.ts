export interface V2 {
  x: number;
  y: number;
}

export type Role = "GK" | "DEF" | "MID" | "FWD";

/** A player's playing style within their role. Changes how the AI behaves. */
export type PlayerStyle =
  | "line" | "sweeper" // GK
  | "stopper" | "cover" // DEF
  | "playmaker" | "box2box" // MID
  | "poacher" | "target"; // FWD

/** 0–100 each. */
export interface Attributes {
  pace: number;
  passing: number;
  shooting: number;
  dribbling: number;
  tackling: number;
  positioning: number;
  /** Goalkeeping: shot stopping. */
  reflexes: number;
  stamina: number;
}

export interface PlayerDef {
  id: string;
  name: string;
  number: number;
  role: Role;
  attrs: Attributes;
  /** Optional playing style. Defaults to the role's plain behaviour. */
  style?: PlayerStyle;
}

export interface ClubDef {
  id: string;
  name: string;
  short: string;
  color: string;
  /** Second colour for numbers/trim. */
  trim: string;
  /** 5 players: index 0 is the goalkeeper. */
  squad: PlayerDef[];
  /** How this club's AI manager likes to play. */
  style: ManagerStyle;
}

export type ManagerStyle = "balanced" | "counter" | "possession" | "gegenpress" | "fortress";

export type Mentality = 0 | 1 | 2 | 3 | 4; // very defensive … very attacking
export type Level3 = 0 | 1 | 2; // low / medium / high

export interface Tactics {
  formation: FormationKey;
  mentality: Mentality;
  pressing: Level3;
  /** 0 short & safe … 2 direct & forward. */
  passing: Level3;
  width: Level3;
}

export type FormationKey = "2-2" | "1-2-1" | "2-1-1" | "3-1" | "1-1-2";

export type Phase = "kickoff" | "play" | "goal" | "halftime" | "fulltime";

export interface PlayerState {
  idx: number; // 0..9 (team 0: 0-4, team 1: 5-9)
  team: 0 | 1;
  slot: number; // 0 = GK, 1..4 formation slots
  def: PlayerDef;
  pos: V2;
  vel: V2;
  stamina: number; // 0..100 (current energy)
  cooldown: number; // ticks until next on-ball decision
  beatenUntil: number; // ticks: lost a tackle / dribbled past
}

export interface BallState {
  pos: V2;
  vel: V2;
  owner: number; // player idx or -1
  lastTouch: number; // player idx or -1
  flight: null | { kind: "pass" | "shot"; from: number; to: number; tick: number };
  /** Ignore control attempts by this player until tick (just kicked it). */
  noTouchBy: number;
  noTouchUntil: number;
}

export interface TeamStats {
  goals: number;
  shots: number;
  onTarget: number;
  passes: number;
  passesCompleted: number;
  tackles: number;
  interceptions: number;
  saves: number;
  possessionTicks: number;
}

export type MatchEvent =
  | { t: number; type: "kickoff"; team: 0 | 1 }
  | { t: number; type: "pass"; from: number; to: number; progressive: boolean }
  | { t: number; type: "pass_complete"; from: number; to: number }
  | { t: number; type: "shot"; by: number; dist: number; onTarget: boolean }
  | { t: number; type: "save"; by: number; shooter: number; held: boolean }
  | { t: number; type: "goal"; by: number; assist: number | null; team: 0 | 1; score: [number, number] }
  | { t: number; type: "miss"; by: number }
  | { t: number; type: "tackle"; by: number; on: number; won: boolean }
  | { t: number; type: "interception"; by: number; from: number }
  | { t: number; type: "dribble"; by: number; past: number }
  | { t: number; type: "tactics"; team: 0 | 1; tactics: Tactics; reason: string; byAI: boolean }
  | { t: number; type: "call"; team: 0 | 1; call: TouchlineCall }
  | { t: number; type: "halftime"; score: [number, number] }
  | { t: number; type: "fulltime"; score: [number, number] };

export interface MatchConfig {
  seed: string;
  home: ClubDef;
  away: ClubDef;
  /** Ticks per half at 10 ticks per second. */
  halfTicks: number;
  /** Which sides the AI manager controls. */
  aiControls: [boolean, boolean];
}

/** A tactical change made by a human manager during the match. Replays re-apply these. */
export interface TacticsInput {
  t: number;
  team: 0 | 1;
  tactics: Tactics;
}

/** A short burst instruction shouted from the touchline. */
export type TouchlineCall = "shoot" | "press" | "keep" | "attack";

export interface CallInput {
  t: number;
  team: 0 | 1;
  call: TouchlineCall;
}

/**
 * Player-manager mode: the human steers one outfield player.
 * `move` is a direction (zero = let the AI position him when he hasn't got the ball).
 * `action` is a one-off pass or shot, taken as soon as he can.
 */
export interface ControlInput {
  t: number;
  team: 0 | 1;
  player: number;
  move: V2;
  action?: "pass" | "shoot";
}

/** Everything a human can do during a match. Recorded so a match can be replayed exactly. */
export type MatchInput = TacticsInput | CallInput | ControlInput;
