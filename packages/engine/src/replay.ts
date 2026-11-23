import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import type { Policy } from "./agent/policy";
import type { MatchConfig } from "./config";
import { cloneState, createGame, step, type GameState } from "./sim";
import type { Action } from "./types";

const CODE: Record<Action, string> = {
  MOVE_UP: "U",
  MOVE_DOWN: "D",
  MOVE_LEFT: "L",
  MOVE_RIGHT: "R",
  USE_BOMB: "B",
  WAIT: "W",
  ESCAPE: "E",
};
const DECODE = Object.fromEntries(Object.entries(CODE).map(([k, v]) => [v, k])) as Record<string, Action>;

export const encodeActions = (a: Action[]) => a.map((x) => CODE[x]).join("");
export function decodeActions(s: string): Action[] {
  return [...s].map((c) => {
    const a = DECODE[c];
    if (!a) throw new Error(`Bad action code: ${c}`);
    return a;
  });
}

/** Stable JSON: object keys sorted, so the same data always hashes the same. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}

export interface ReplayPayload {
  config: MatchConfig;
  policy: Policy;
  actions: string;
  score: number;
  status: string;
  hp?: number;
}

export function replayHash(p: ReplayPayload): `0x${string}` {
  const body = canonicalJson({
    config: p.config,
    policy: { version: p.policy.version, personality: p.policy.personality, weights: p.policy.weights, prefs: p.policy.prefs },
    actions: p.actions,
    score: p.score,
    status: p.status,
    hp: p.hp,
  });
  return `0x${bytesToHex(keccak_256(utf8ToBytes(body)))}`;
}

/**
 * Rebuilds every frame of a match from its config and recorded actions.
 * Used by the Phaser client for playback and scrubbing.
 */
export function* replayFrames(config: MatchConfig, actions: string, hp?: number): Generator<GameState> {
  const s = createGame(config, { hp });
  yield cloneState(s);
  for (const a of decodeActions(actions)) {
    if (s.status !== "running") break;
    step(s, a);
    yield cloneState(s);
  }
}

/** Final state after replaying recorded actions (no brain involved). */
export function replayFinal(config: MatchConfig, actions: string, hp?: number): GameState {
  const s = createGame(config, { hp });
  for (const a of decodeActions(actions)) {
    if (s.status !== "running") break;
    step(s, a);
  }
  return s;
}
