import { execFileSync } from "node:child_process";

export type CredentialSource = "explicit" | "GITHUB_TOKEN" | "GH_TOKEN" | "github-cli" | "none";

export interface CredentialOptions {
  token?: string;
  env?: NodeJS.ProcessEnv;
  githubCliToken?: () => string | null;
}

export interface AuthResolution {
  token: string | null;
  source: CredentialSource;
}

function defaultGitHubCliToken(): string | null {
  try {
    const token = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return token === "" ? null : token;
  } catch {
    return null;
  }
}

export function resolveCredentials(options: CredentialOptions = {}): AuthResolution {
  if (options.token?.trim()) return { token: options.token.trim(), source: "explicit" };
  if (options.env?.GITHUB_TOKEN?.trim()) return { token: options.env.GITHUB_TOKEN.trim(), source: "GITHUB_TOKEN" };
  if (options.env?.GH_TOKEN?.trim()) return { token: options.env.GH_TOKEN.trim(), source: "GH_TOKEN" };
  const token = (options.githubCliToken ?? defaultGitHubCliToken)();
  return token === null ? { token: null, source: "none" } : { token, source: "github-cli" };
}

export function authStatus(options: CredentialOptions = {}): { authenticated: boolean; source: CredentialSource } {
  const result = resolveCredentials(options);
  return { authenticated: result.token !== null, source: result.source };
}
