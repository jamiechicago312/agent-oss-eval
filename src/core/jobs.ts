import { randomUUID } from "node:crypto";
import { CancellationError, InvalidInputError } from "./errors.js";
import type { JsonValue } from "./types.js";
import type { AnalysisJob, AnalysisJobStore } from "../storage/types.js";

export interface DurableWorkOptions<T extends JsonValue> {
  store: AnalysisJobStore;
  repository: string;
  requestedWindow: string;
  selectedWindow: string;
  items: readonly T[];
  process: (item: T, index: number) => Promise<JsonValue>;
  jobId?: string;
  maxItems?: number;
  signal?: AbortSignal;
  now?: () => string;
}

interface JobPayload extends Record<string, JsonValue> {
  results: JsonValue[];
}

export async function runDurableWork<T extends JsonValue>(options: DurableWorkOptions<T>): Promise<AnalysisJob<JobPayload>> {
  const now = options.now ?? (() => new Date().toISOString());
  let job = options.jobId === undefined ? null : options.store.getJob<JobPayload>(options.jobId);
  if (options.jobId !== undefined && job === null) throw new InvalidInputError(`Analysis job not found: ${options.jobId}`);
  if (job !== null && job.totalItems !== options.items.length) throw new InvalidInputError("Analysis plan changed; start a new job");
  if (job === null) {
    job = { id: options.jobId ?? randomUUID(), repository: options.repository, requestedWindow: options.requestedWindow,
      selectedWindow: options.selectedWindow, planVersion: 1, phase: "work", status: "planned", completedItems: 0,
      totalItems: options.items.length, requestsUsed: 0, pagesUsed: 0, checkpointAt: now(), reason: null,
      payload: { results: [] } };
    options.store.createJob(job);
  }
  job = { ...job, status: "running", reason: null, checkpointAt: now() };
  options.store.updateJob(job);
  const stopAt = Math.min(options.items.length, job.completedItems + (options.maxItems ?? options.items.length));
  try {
    for (let index = job.completedItems; index < stopAt; index += 1) {
      if (options.signal?.aborted) throw new CancellationError();
      const result = await options.process(options.items[index]!, index);
      job = { ...job, completedItems: index + 1, requestsUsed: job.requestsUsed + 1, pagesUsed: job.pagesUsed + 1,
        checkpointAt: now(), payload: { results: [...job.payload.results, result] } };
      options.store.updateJob(job);
    }
    const complete = job.completedItems === job.totalItems;
    job = { ...job, status: complete ? "completed" : "paused", phase: complete ? "complete" : "work",
      reason: complete ? null : "Execution budget reached; continue with this job ID", checkpointAt: now() };
    options.store.updateJob(job);
    return job;
  } catch (error) {
    job = { ...job, status: error instanceof CancellationError ? "cancelled" : "failed",
      reason: error instanceof Error ? error.message : "Unknown job failure", checkpointAt: now() };
    options.store.updateJob(job);
    throw error;
  }
}
