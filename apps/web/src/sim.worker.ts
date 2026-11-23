/// <reference lib="webworker" />
import {
  type Experience,
  type MatchAnalysis,
  type MatchConfig,
  type Policy,
  type PolicyHistory,
  learnFromMatch,
  runMatch,
  type MatchResult,
} from "@aftermaze/engine";

/** Runs simulations and learning off the main thread so the arena stays smooth. */
export type WorkerRequest =
  | { id: number; type: "run"; config: MatchConfig; policy: Policy; hp?: number }
  | {
      id: number;
      type: "learn";
      history: PolicyHistory;
      result: MatchResult;
      memory: Experience[];
      analyses: MatchAnalysis[];
    };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.type === "run") {
      const result = runMatch(req.config, req.policy, { hp: req.hp });
      self.postMessage({ id: req.id, ok: true, result });
    } else {
      const out = learnFromMatch(req.history, req.result, req.memory, req.analyses, 12);
      self.postMessage({ id: req.id, ok: true, result: { history: out.history, memory: out.memory, report: out.report } });
    }
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: String(err) });
  }
};
