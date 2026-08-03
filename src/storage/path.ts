import { homedir } from "node:os";
import { join } from "node:path";

export function defaultDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  const dataHome = env.XDG_DATA_HOME?.trim();
  return join(dataHome && dataHome.length > 0 ? dataHome : join(homedir(), ".local", "share"), "oss-eval", "history.sqlite3");
}

export function resolveDatabasePath(override?: string, env: NodeJS.ProcessEnv = process.env): string {
  return override ?? env.OSS_EVAL_DB ?? defaultDatabasePath(env);
}
