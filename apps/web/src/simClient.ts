import type {
  Experience,
  LearningReport,
  MatchAnalysis,
  MatchConfig,
  MatchResult,
  Policy,
  PolicyHistory,
} from "@aftermaze/engine";
import type { WorkerRequest } from "./sim.worker";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error ?? "Simulation failed"));
    };
  }
  return worker;
}

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

function call<T>(req: WithoutId<WorkerRequest>): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    getWorker().postMessage({ ...req, id });
  });
}

export const runInWorker = (config: MatchConfig, policy: Policy, hp?: number) =>
  call<MatchResult>({ type: "run", config, policy, hp });

export const learnInWorker = (history: PolicyHistory, result: MatchResult, memory: Experience[], analyses: MatchAnalysis[]) =>
  call<{ history: PolicyHistory; memory: Experience[]; report: LearningReport }>({
    type: "learn",
    history,
    result,
    memory,
    analyses,
  });
