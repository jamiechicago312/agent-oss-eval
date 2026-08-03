import { analyzeRepository } from "./core/analyzer.js";
import { createConfig, type ConfigInput } from "./core/config.js";
import type { ProgressListener } from "./core/planning.js";
import type { Report } from "./core/types.js";
import type { GitHubProvider } from "./github/types.js";
import type { SnapshotStore } from "./storage/types.js";

export interface EvaluateRepositoryOptions extends ConfigInput {
  provider?: GitHubProvider;
  store?: SnapshotStore;
  generatedAt?: string;
  progress?: ProgressListener;
  signal?: AbortSignal;
}

export async function evaluateRepository(repository: string, options: EvaluateRepositoryOptions = {}): Promise<Report> {
  const { provider, store, generatedAt, progress, signal, ...configInput } = options;
  return analyzeRepository({
    config: createConfig(repository, configInput),
    ...(provider === undefined ? {} : { provider }),
    ...(store === undefined ? {} : { store }),
    ...(generatedAt === undefined ? {} : { generatedAt }),
    ...(progress === undefined ? {} : { progress }),
    ...(signal === undefined ? {} : { signal })
  });
}
