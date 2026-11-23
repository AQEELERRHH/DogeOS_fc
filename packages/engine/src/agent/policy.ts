/** The five behavioural dimensions from the spec. All integers in [MIN_WEIGHT, MAX_WEIGHT]. */
export interface Weights {
  exploration: number;
  survival: number;
  efficiency: number;
  aggression: number;
  resourcefulness: number;
}

export type Dimension = keyof Weights;
export const DIMENSIONS: readonly Dimension[] = [
  "exploration",
  "survival",
  "efficiency",
  "aggression",
  "resourcefulness",
];

/** Extra behaviour switches that coaching can turn on. */
export interface Preferences {
  /** Avoid 1-wide corridors while a Seeker is close. */
  corridorCaution: boolean;
}

export type Personality = "explorer" | "survivor" | "speedrunner" | "aggressive";

export const MIN_WEIGHT = 5;
export const MAX_WEIGHT = 95;

/**
 * Starting weights. Every personality sums to 250, so they're different preferences,
 * not different power levels.
 */
export const PERSONALITIES: Record<Personality, { label: string; description: string; weights: Weights }> = {
  explorer: {
    label: "Explorer",
    description: "Investigates more routes and searches thoroughly.",
    weights: { exploration: 75, survival: 50, efficiency: 35, aggression: 40, resourcefulness: 50 },
  },
  survivor: {
    label: "Survivor",
    description: "Prioritises safety and avoiding enemies.",
    weights: { exploration: 40, survival: 80, efficiency: 40, aggression: 25, resourcefulness: 65 },
  },
  speedrunner: {
    label: "Speedrunner",
    description: "Prefers efficient routes and faster completion.",
    weights: { exploration: 25, survival: 45, efficiency: 85, aggression: 45, resourcefulness: 50 },
  },
  aggressive: {
    label: "Aggressive",
    description: "Takes calculated risks and uses bombs more readily.",
    weights: { exploration: 40, survival: 35, efficiency: 50, aggression: 85, resourcefulness: 40 },
  },
};

/** The part of a policy the brain needs to make decisions. */
export interface Policy {
  version: number;
  personality: Personality;
  weights: Weights;
  prefs: Preferences;
}

export interface WeightChange {
  dimension: Dimension | "corridorCaution";
  from: number | boolean;
  to: number | boolean;
  reason: string;
}

export type PolicySource = "personality" | "learning" | "coaching" | "rollback";

export interface PolicyVersion extends Policy {
  parent: number | null;
  source: PolicySource;
  changes: WeightChange[];
  note: string;
  /** Match id (learning) or coaching text (coaching), if any. */
  ref: string | null;
}

/** Full history for one agent. Versions are never edited or deleted. */
export interface PolicyHistory {
  active: number;
  versions: PolicyVersion[];
}

export const clampWeight = (v: number) => Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, Math.round(v)));

export function newPolicyHistory(personality: Personality): PolicyHistory {
  return {
    active: 1,
    versions: [
      {
        version: 1,
        parent: null,
        personality,
        weights: { ...PERSONALITIES[personality].weights },
        prefs: { corridorCaution: false },
        source: "personality",
        changes: [],
        note: `Initial ${PERSONALITIES[personality].label} personality`,
        ref: null,
      },
    ],
  };
}

export function activePolicy(h: PolicyHistory): PolicyVersion {
  const v = h.versions.find((p) => p.version === h.active);
  if (!v) throw new Error(`Active policy v${h.active} missing`);
  return v;
}

/** Applies deltas within bounds and appends a new version. Returns the same history if nothing changed. */
export function deriveVersion(
  h: PolicyHistory,
  source: PolicySource,
  deltas: Partial<Record<Dimension, { delta: number; reason: string }>>,
  note: string,
  ref: string | null,
  prefs?: Partial<Preferences> & { reason?: string },
): { history: PolicyHistory; version: PolicyVersion | null } {
  const base = activePolicy(h);
  const weights = { ...base.weights };
  const changes: WeightChange[] = [];
  for (const dim of DIMENSIONS) {
    const d = deltas[dim];
    if (!d || d.delta === 0) continue;
    const to = clampWeight(weights[dim] + d.delta);
    if (to !== weights[dim]) {
      changes.push({ dimension: dim, from: weights[dim], to, reason: d.reason });
      weights[dim] = to;
    }
  }
  const nextPrefs = { ...base.prefs };
  if (prefs?.corridorCaution !== undefined && prefs.corridorCaution !== base.prefs.corridorCaution) {
    changes.push({
      dimension: "corridorCaution",
      from: base.prefs.corridorCaution,
      to: prefs.corridorCaution,
      reason: prefs.reason ?? "Coaching",
    });
    nextPrefs.corridorCaution = prefs.corridorCaution;
  }
  if (!changes.length) return { history: h, version: null };

  const version: PolicyVersion = {
    version: Math.max(...h.versions.map((v) => v.version)) + 1,
    parent: base.version,
    personality: base.personality,
    weights,
    prefs: nextPrefs,
    source,
    changes,
    note,
    ref,
  };
  return { history: { active: version.version, versions: [...h.versions, version] }, version };
}

/** Rolls back by creating a new version that copies an older one, so history stays append-only. */
export function rollback(h: PolicyHistory, toVersion: number): PolicyHistory {
  const target = h.versions.find((v) => v.version === toVersion);
  if (!target) throw new Error(`No policy version ${toVersion}`);
  const base = activePolicy(h);
  const changes: WeightChange[] = DIMENSIONS.filter((d) => base.weights[d] !== target.weights[d]).map((d) => ({
    dimension: d,
    from: base.weights[d],
    to: target.weights[d],
    reason: `Rollback to v${toVersion}`,
  }));
  const version: PolicyVersion = {
    ...structuredClone(target),
    version: Math.max(...h.versions.map((v) => v.version)) + 1,
    parent: base.version,
    source: "rollback",
    changes,
    note: `Rolled back to v${toVersion}`,
    ref: null,
  };
  return { active: version.version, versions: [...h.versions, version] };
}
