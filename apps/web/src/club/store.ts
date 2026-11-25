import { useCallback, useSyncExternalStore } from "react";
import { CLUBS, pointsForResult, runDrill, type ClubDef, type PlayerDef, type PlayerStyle } from "@dogefc/engine";

/** Everything about the player's own club, saved in this browser. */
export interface SavedClub {
  v: 1;
  name: string;
  short: string;
  color: string;
  trim: string;
  players: PlayerDef[];
  points: number;
  record: { w: number; d: number; l: number; gf: number; ga: number };
  history: { at: number; rival: string; gf: number; ga: number; points: number }[];
  trainingLog: { at: number; player: string; drill: string }[];
}

const KEY = "dogefc.club.v1";

/** Kit colours a club can pick. Kept bold so they read well on the pitch. */
export const KIT_COLORS = ["#22E4F5", "#FFC23D", "#FF4D6D", "#7CFF6B", "#B07CFF", "#FF8A3D", "#F4F7FB", "#2E6BFF"];
export const TRIM_COLORS = ["#070B14", "#F4F7FB", "#1B2742", "#5A0F1E"];

/** The starting squad for a new club: the DOGE FC template. Names can be changed. */
export function starterPlayers(): PlayerDef[] {
  return CLUBS[0].squad.map((p, i) => ({ ...p, id: `my-${i}`, attrs: { ...p.attrs } }));
}

let cache: SavedClub | null | undefined;
const listeners = new Set<() => void>();

function read(): SavedClub | null {
  if (cache !== undefined) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedClub) : null;
    cache = parsed && parsed.v === 1 && Array.isArray(parsed.players) && parsed.players.length === 5 ? parsed : null;
  } catch {
    cache = null;
  }
  return cache;
}

function write(next: SavedClub | null) {
  cache = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be unavailable (private mode). The club still works for this visit.
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = undefined;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function createClub(input: { name: string; short: string; color: string; trim: string; players: PlayerDef[] }): SavedClub {
  const club: SavedClub = {
    v: 1,
    ...input,
    points: 5, // a welcome budget so the first training session can happen straight away
    record: { w: 0, d: 0, l: 0, gf: 0, ga: 0 },
    history: [],
    trainingLog: [],
  };
  write(club);
  return club;
}

/** Turns the saved club into the engine's club definition. */
export function toClubDef(c: SavedClub): ClubDef {
  return { id: "my-club", name: c.name, short: c.short, color: c.color, trim: c.trim, style: "balanced", squad: c.players };
}

export function useClub() {
  const club = useSyncExternalStore(subscribe, read, () => null);

  const update = useCallback((fn: (c: SavedClub) => SavedClub) => {
    const cur = read();
    if (cur) write(fn(cur));
  }, []);

  const train = useCallback(
    (playerId: string, drillId: string): boolean => {
      const cur = read();
      if (!cur) return false;
      const i = cur.players.findIndex((p) => p.id === playerId);
      if (i < 0) return false;
      const r = runDrill(cur.players[i], drillId, cur.points);
      if (!r) return false;
      const players = cur.players.slice();
      players[i] = r.player;
      write({
        ...cur,
        players,
        points: cur.points - r.cost,
        trainingLog: [{ at: Date.now(), player: r.player.name, drill: drillId }, ...cur.trainingLog].slice(0, 30),
      });
      return true;
    },
    [],
  );

  const setStyle = useCallback(
    (playerId: string, style: PlayerStyle | undefined) =>
      update((c) => ({ ...c, players: c.players.map((p) => (p.id === playerId ? withStyle(p, style) : p)) })),
    [update],
  );

  const rename = useCallback(
    (playerId: string, name: string) => update((c) => ({ ...c, players: c.players.map((p) => (p.id === playerId ? { ...p, name } : p)) })),
    [update],
  );

  /** Records a finished match once and returns the points earned. */
  const recordResult = useCallback((rival: string, gf: number, ga: number): number => {
    const cur = read();
    if (!cur) return 0;
    const pts = pointsForResult(gf, ga);
    const r = cur.record;
    write({
      ...cur,
      points: cur.points + pts,
      record: { w: r.w + (gf > ga ? 1 : 0), d: r.d + (gf === ga ? 1 : 0), l: r.l + (gf < ga ? 1 : 0), gf: r.gf + gf, ga: r.ga + ga },
      history: [{ at: Date.now(), rival, gf, ga, points: pts }, ...cur.history].slice(0, 20),
    });
    return pts;
  }, []);

  const reset = useCallback(() => write(null), []);

  return { club, update, train, setStyle, rename, recordResult, reset };
}

function withStyle(p: PlayerDef, style: PlayerStyle | undefined): PlayerDef {
  const { style: _old, ...rest } = p;
  return style ? { ...rest, style } : rest;
}
