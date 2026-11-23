import { type Dimension, type PolicyHistory, type PolicyVersion, deriveVersion } from "./policy";

/** Largest change to one dimension from a single coaching message. */
export const MAX_COACHING_STEP = 8;

interface Rule {
  id: string;
  pattern: RegExp;
  understood: string;
  effects: Partial<Record<Dimension, number>>;
  corridorCaution?: boolean;
  /** If preceded by "don't/stop/less/never", flip the effects. */
  invertible?: boolean;
  invertedUnderstood?: string;
}

const NEGATION = /\b(don'?t|do not|stop|never|less|quit|no more|avoid)\b/;

/** Ordered; first matching rule per clause wins, so specific rules come first. */
const RULES: Rule[] = [
  {
    id: "corridor",
    pattern: /\b(narrow|tight|small)\s+(corridor|passage|hall|tunnel)s?/,
    understood: "Avoid narrow corridors when a Seeker is close",
    effects: { survival: 2 },
    corridorCaution: true,
  },
  {
    id: "save-bombs",
    pattern: /(wast\w*|spam\w*|overus\w*)\s+(\w+\s+)?bombs?|\b(save|conserve|keep|hold)\s+(\w+\s+)?bombs?/,
    understood: "Use bombs more carefully",
    effects: { resourcefulness: 6, aggression: -3 },
  },
  {
    id: "use-bombs",
    pattern: /\b(use|fire|drop|throw)\s+(more\s+|your\s+|the\s+)?bombs?|\bbe\s+(more\s+)?aggressive|\bfight\s+back|\bstun\s+(more|them|enemies)/,
    understood: "Use bombs and fight back more readily",
    effects: { aggression: 6, resourcefulness: -3 },
    invertible: true,
    invertedUnderstood: "Use bombs more carefully",
  },
  {
    id: "avoid-enemies",
    pattern: /\b(avoid|stay away from|keep away from|run from|dodge|evade)\b.*\b(enem\w*|seekers?|sentinels?|hunters?|robots?)/,
    understood: "Keep more distance from enemies",
    effects: { survival: 6, aggression: -2 },
  },
  {
    id: "crystals",
    pattern: /\b(prioriti[sz]e|focus on|go for|get|collect)\b.*\bcrystals?/,
    understood: "Go for crystals first, fewer detours",
    effects: { efficiency: 4, exploration: -3 },
  },
  {
    id: "shorter",
    pattern: /\b(short(er|est)?|fast(er|est)?|quick(er|est)?|direct|efficient)\s+(route|path|way)s?|\bspeed\s?run|\bhurry|\bgo faster|\bbe faster/,
    understood: "Prefer shorter, faster routes",
    effects: { efficiency: 6, exploration: -3 },
    invertible: true,
    invertedUnderstood: "Take more time to choose routes",
  },
  {
    id: "explore",
    pattern: /\b(explor\w*|search\w*|investigat\w*|look around|bonus(es)?)\b/,
    understood: "Explore more and pick up bonus items",
    effects: { exploration: 6, efficiency: -3 },
    invertible: true,
    invertedUnderstood: "Explore less and stay on task",
  },
  {
    id: "survive",
    pattern: /\b(surviv\w*|stay alive|be (more )?careful|play (it )?safe|cautious|safety)\b/,
    understood: "Focus more on survival",
    effects: { survival: 6, aggression: -2 },
  },
  {
    id: "risk",
    pattern: /\b(take (more )?risks?|be bold|be brave|less careful|risky)\b/,
    understood: "Take more calculated risks",
    effects: { survival: -4, aggression: 4 },
  },
];

export interface CoachingIntent {
  clause: string;
  rule: string;
  understood: string;
  effects: Partial<Record<Dimension, number>>;
  corridorCaution?: boolean;
}

export interface CoachingInterpretation {
  text: string;
  intents: CoachingIntent[];
  /** Clauses we couldn't map to anything. Shown to the player, never executed. */
  ignored: string[];
}

/** Maps plain-language coaching to supported behaviour changes. Never executes user input. */
export function interpretCoaching(text: string): CoachingInterpretation {
  const clean = text.toLowerCase().replace(/[’']/g, "'").slice(0, 500);
  const clauses = clean
    .split(/[.!?;\n]+|,|\bbut\b|\band\b/)
    .map((c) => c.trim())
    .filter((c) => c.length > 1);

  const intents: CoachingIntent[] = [];
  const ignored: string[] = [];
  for (const clause of clauses) {
    const rule = RULES.find((r) => r.pattern.test(clause));
    if (!rule) {
      // "avoid seekers and sentinels": a fragment that only makes sense joined to the previous clause.
      const prev = intents[intents.length - 1];
      if (prev && clause.split(/\s+/).length <= 2 && RULES.find((r) => r.pattern.test(`${prev.clause} and ${clause}`))?.id === prev.rule.split(":")[0]) {
        prev.clause = `${prev.clause} and ${clause}`;
        continue;
      }
      ignored.push(clause);
      continue;
    }
    const m = clause.match(rule.pattern)!;
    const before = clause.slice(0, m.index ?? 0);
    const negated = rule.invertible && NEGATION.test(before.split(/\s+/).slice(-3).join(" "));
    const effects: Partial<Record<Dimension, number>> = {};
    for (const [k, val] of Object.entries(rule.effects)) effects[k as Dimension] = negated ? -val! : val!;
    intents.push({
      clause,
      rule: negated ? `${rule.id}:inverted` : rule.id,
      understood: negated ? rule.invertedUnderstood ?? `Not: ${rule.understood}` : rule.understood,
      effects,
      corridorCaution: rule.corridorCaution,
    });
  }
  return { text, intents, ignored };
}

/** Interprets coaching and records it as a new policy version. */
export function applyCoaching(
  history: PolicyHistory,
  text: string,
): { history: PolicyHistory; version: PolicyVersion | null; interpretation: CoachingInterpretation } {
  const interpretation = interpretCoaching(text);
  const totals = new Map<Dimension, { delta: number; reasons: string[] }>();
  let corridor: boolean | undefined;
  for (const it of interpretation.intents) {
    for (const [k, val] of Object.entries(it.effects)) {
      const t = totals.get(k as Dimension) ?? { delta: 0, reasons: [] };
      t.delta += val!;
      t.reasons.push(it.understood);
      totals.set(k as Dimension, t);
    }
    if (it.corridorCaution) corridor = true;
  }
  const deltas: Partial<Record<Dimension, { delta: number; reason: string }>> = {};
  for (const [k, t] of totals) {
    deltas[k] = {
      delta: Math.max(-MAX_COACHING_STEP, Math.min(MAX_COACHING_STEP, t.delta)),
      reason: `Coaching: ${[...new Set(t.reasons)].join("; ")}`,
    };
  }
  const note = interpretation.intents.length
    ? `Coached: ${interpretation.intents.map((i) => i.understood).join("; ")}`
    : "Coaching not understood";
  const { history: next, version } = deriveVersion(history, "coaching", deltas, note, text, {
    corridorCaution: corridor,
    reason: "Coaching: avoid narrow corridors near Seekers",
  });
  return { history: next, version, interpretation };
}
