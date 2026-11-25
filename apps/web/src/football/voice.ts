import { useCallback, useEffect, useRef, useState } from "react";
import type { CommentaryLine } from "@dogefc/engine";

/**
 * Spoken commentary using the browser's built-in speech. Free, no server.
 *
 * A match produces more lines than anyone could read out, so the voice is picky:
 * goals interrupt whatever is being said, whistles and chances wait their turn,
 * and ordinary play is only described when the voice has been quiet for a while.
 * Anything that goes stale is dropped, so the voice never falls behind the match.
 */

const KEY = "dogefc.voice";
const PRIORITY: Record<CommentaryLine["tone"], number> = { goal: 4, whistle: 3, chance: 2, tactic: 1, info: 0 };
const STALE_MS = 3500;
const QUIET_BEFORE_INFO_MS = 5000;

/** Scores are read the football way: "2–0" becomes "2 nil". */
function spoken(text: string) {
  const n = (x: string) => (x === "0" ? "nil" : x);
  return text.replace(/(\d+)\s*–\s*(\d+)/g, (_m, a: string, b: string) => `${n(a)} ${n(b)}`);
}

export const voiceSupported = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  if (!voices.length) return null;
  const prefer = [/google uk english male/i, /daniel/i, /google uk english/i, /en-gb/i, /arthur/i, /google us english/i, /natural/i];
  for (const re of prefer) {
    const v = voices.find((x) => re.test(x.name) || re.test(x.lang));
    if (v) return v;
  }
  return voices.find((v) => v.default) ?? voices[0];
}

export function useCommentaryVoice(matchKey: string, paused: boolean) {
  const supported = voiceSupported();
  const [on, setOn] = useState(() => {
    try {
      return supported && localStorage.getItem(KEY) === "on";
    } catch {
      return false;
    }
  });
  const seen = useRef(0);
  const pending = useRef<{ line: CommentaryLine; at: number } | null>(null);
  const speaking = useRef(false);
  const lastSpoke = useRef(0);
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  const onRef = useRef(on);
  onRef.current = on;

  useEffect(() => {
    if (!supported) return;
    const load = () => (voice.current = pickVoice());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [supported]);

  // New match: forget everything from the last one.
  useEffect(() => {
    seen.current = 0;
    pending.current = null;
    if (supported) window.speechSynthesis.cancel();
    speaking.current = false;
  }, [matchKey, supported]);

  // Stop talking when paused, when muted and when leaving the page.
  useEffect(() => {
    if (supported && (paused || !on)) {
      window.speechSynthesis.cancel();
      speaking.current = false;
      pending.current = null;
    }
  }, [paused, on, supported]);
  useEffect(() => () => {
    if (voiceSupported()) window.speechSynthesis.cancel();
  }, []);

  const say = useCallback((line: CommentaryLine) => {
    const u = new SpeechSynthesisUtterance(spoken(line.text));
    if (voice.current) u.voice = voice.current;
    const excited = line.tone === "goal";
    u.rate = excited ? 1.12 : 1.05;
    u.pitch = excited ? 1.2 : 1;
    u.volume = 1;
    u.onend = u.onerror = () => {
      speaking.current = false;
      lastSpoke.current = performance.now();
    };
    speaking.current = true;
    lastSpoke.current = performance.now();
    window.speechSynthesis.speak(u);
  }, []);

  /** Call with the full commentary list on every update. */
  const feed = useCallback(
    (lines: CommentaryLine[]) => {
      if (!supported) return;
      const fresh = lines.slice(seen.current);
      seen.current = lines.length;
      if (!onRef.current || paused) return;
      const now = performance.now();
      for (const line of fresh) {
        if (line.tone === "goal") {
          // A goal always gets called, straight away.
          window.speechSynthesis.cancel();
          speaking.current = false;
          pending.current = null;
          say(line);
          continue;
        }
        const p = pending.current;
        if (!p || PRIORITY[line.tone] >= PRIORITY[p.line.tone] || now - p.at > STALE_MS) pending.current = { line, at: now };
      }
      const p = pending.current;
      if (!p || speaking.current) return;
      if (now - p.at > STALE_MS) {
        pending.current = null;
        return;
      }
      if (p.line.tone === "info" && now - lastSpoke.current < QUIET_BEFORE_INFO_MS) return;
      pending.current = null;
      say(p.line);
    },
    [supported, paused, say],
  );

  const toggle = useCallback(() => {
    const next = !onRef.current;
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
      // ignore
    }
    if (next && voiceSupported()) {
      // Speaking inside the click unlocks audio on iPhone and Safari.
      const hello = new SpeechSynthesisUtterance("Commentary on.");
      if (voice.current) hello.voice = voice.current;
      window.speechSynthesis.speak(hello);
    }
    setOn(next);
  }, []);

  return { supported, on, toggle, feed };
}
