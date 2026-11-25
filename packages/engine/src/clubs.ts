import type { Attributes, ClubDef, ManagerStyle, PlayerDef, Role, Tactics } from "./types";

const A = (pace: number, passing: number, shooting: number, dribbling: number, tackling: number, positioning: number, reflexes: number, stamina: number): Attributes => ({
  pace, passing, shooting, dribbling, tackling, positioning, reflexes, stamina,
});

const P = (id: string, name: string, number: number, role: Role, attrs: Attributes): PlayerDef => ({ id, name, number, role, attrs });

/** All clubs and players are invented. */
export const CLUBS: ClubDef[] = [
  {
    id: "doge-fc",
    name: "DOGE FC",
    short: "DFC",
    color: "#22E4F5",
    trim: "#070B14",
    style: "balanced",
    squad: [
      P("dfc-1", "Bako", 1, "GK", A(45, 55, 20, 30, 30, 70, 74, 70)),
      P("dfc-4", "Adeyemi", 4, "DEF", A(62, 60, 35, 50, 74, 70, 10, 72)),
      P("dfc-8", "Nupe", 8, "MID", A(66, 74, 58, 66, 58, 64, 10, 76)),
      P("dfc-7", "Zara", 7, "MID", A(72, 68, 60, 72, 50, 60, 10, 70)),
      P("dfc-9", "Kanu", 9, "FWD", A(74, 58, 74, 68, 35, 66, 10, 68)),
    ],
  },
  {
    id: "iron-wolves",
    name: "Iron Wolves",
    short: "IRW",
    color: "#C9D3E6",
    trim: "#1B2742",
    style: "fortress",
    squad: [
      P("irw-1", "Halvorsen", 1, "GK", A(40, 50, 15, 25, 30, 74, 80, 70)),
      P("irw-5", "Brask", 5, "DEF", A(55, 55, 30, 40, 80, 76, 10, 74)),
      P("irw-3", "Lund", 3, "DEF", A(58, 52, 30, 42, 76, 72, 10, 74)),
      P("irw-6", "Moen", 6, "MID", A(60, 66, 50, 55, 66, 66, 10, 76)),
      P("irw-9", "Vik", 9, "FWD", A(64, 52, 70, 58, 40, 64, 10, 70)),
    ],
  },
  {
    id: "neon-strikers",
    name: "Neon Strikers",
    short: "NEO",
    color: "#FF3B5C",
    trim: "#FFE3E9",
    style: "gegenpress",
    squad: [
      P("neo-1", "Ortiz", 1, "GK", A(50, 52, 20, 30, 30, 64, 68, 70)),
      P("neo-2", "Reyes", 2, "DEF", A(66, 56, 38, 52, 62, 58, 10, 74)),
      P("neo-10", "Luz", 10, "MID", A(70, 64, 60, 70, 54, 58, 10, 74)),
      P("neo-11", "Vega", 11, "FWD", A(74, 54, 64, 72, 38, 58, 10, 72)),
      P("neo-9", "Cruz", 9, "FWD", A(72, 52, 68, 66, 36, 60, 10, 70)),
    ],
  },
  {
    id: "harbour-rovers",
    name: "Harbour Rovers",
    short: "HBR",
    color: "#3CF28B",
    trim: "#062A16",
    style: "possession",
    squad: [
      P("hbr-1", "Mensah", 1, "GK", A(46, 66, 20, 35, 30, 68, 70, 70)),
      P("hbr-4", "Owusu", 4, "DEF", A(60, 70, 35, 58, 68, 68, 10, 72)),
      P("hbr-6", "Boateng", 6, "MID", A(62, 80, 55, 70, 58, 70, 10, 76)),
      P("hbr-8", "Asante", 8, "MID", A(64, 78, 58, 72, 52, 66, 10, 74)),
      P("hbr-9", "Appiah", 9, "FWD", A(68, 66, 70, 70, 36, 68, 10, 70)),
    ],
  },
  {
    id: "desert-hawks",
    name: "Desert Hawks",
    short: "DSH",
    color: "#FFB020",
    trim: "#2A1E04",
    style: "counter",
    squad: [
      P("dsh-1", "Haddad", 1, "GK", A(48, 50, 20, 30, 30, 70, 72, 70)),
      P("dsh-3", "Karim", 3, "DEF", A(66, 54, 32, 45, 74, 70, 10, 74)),
      P("dsh-5", "Nasser", 5, "DEF", A(64, 56, 30, 44, 72, 72, 10, 74)),
      P("dsh-7", "Sami", 7, "MID", A(82, 60, 56, 72, 48, 58, 10, 72)),
      P("dsh-9", "Faris", 9, "FWD", A(86, 52, 72, 70, 34, 60, 10, 70)),
    ],
  },
];

export const clubById = (id: string) => {
  const c = CLUBS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown club ${id}`);
  return c;
};

/** Starting tactics each AI manager style prefers. */
export const STYLE_TACTICS: Record<ManagerStyle, Tactics> = {
  balanced: { formation: "1-2-1", mentality: 2, pressing: 1, passing: 1, width: 1 },
  counter: { formation: "2-1-1", mentality: 1, pressing: 0, passing: 2, width: 1 },
  possession: { formation: "1-2-1", mentality: 2, pressing: 1, passing: 0, width: 2 },
  gegenpress: { formation: "1-1-2", mentality: 3, pressing: 2, passing: 1, width: 1 },
  fortress: { formation: "3-1", mentality: 1, pressing: 0, passing: 1, width: 0 },
};

export const STYLE_LABEL: Record<ManagerStyle, string> = {
  balanced: "Balanced",
  counter: "Counter-attack",
  possession: "Possession",
  gegenpress: "High press",
  fortress: "Park the bus",
};
