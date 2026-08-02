import { describe, expect, it } from "vitest";
import { authStatus, resolveCredentials } from "../../src/auth/credentials.js";

describe("GitHub credentials", () => {
  it("uses explicit, environment, then CLI credentials in order", () => {
    expect(resolveCredentials({
      token: "explicit",
      env: { GITHUB_TOKEN: "github", GH_TOKEN: "gh" },
      githubCliToken: () => "cli"
    })).toEqual({ token: "explicit", source: "explicit" });
    expect(resolveCredentials({ env: { GITHUB_TOKEN: "github", GH_TOKEN: "gh" }, githubCliToken: () => "cli" })).toEqual({
      token: "github",
      source: "GITHUB_TOKEN"
    });
    expect(resolveCredentials({ env: { GH_TOKEN: "gh" }, githubCliToken: () => "cli" })).toEqual({
      token: "gh",
      source: "GH_TOKEN"
    });
    expect(resolveCredentials({ env: {}, githubCliToken: () => "cli" })).toEqual({ token: "cli", source: "github-cli" });
  });

  it("reports only safe authentication status", () => {
    expect(authStatus({ token: "secret" })).toEqual({ authenticated: true, source: "explicit" });
    expect(authStatus({ env: {}, githubCliToken: () => null })).toEqual({ authenticated: false, source: "none" });
  });
});
