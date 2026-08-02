import { describe, expect, it } from "vitest";
import {
  createConfig,
  parseIsoTimestamp,
  parseOutputFormat,
  parseRepository,
  parseWindow
} from "../../src/core/config.js";
import { InvalidInputError } from "../../src/core/errors.js";

describe("configuration parsing", () => {
  it("parses repository references", () => {
    expect(parseRepository("octo/repo")).toEqual({
      owner: "octo",
      name: "repo",
      fullName: "octo/repo",
      url: "https://github.com/octo/repo"
    });
  });

  it.each(["octo", "octo/repo/extra", "octo/repo name"])("rejects invalid repository %s", (value) => {
    expect(() => parseRepository(value)).toThrow(InvalidInputError);
  });

  it("parses automatic, fixed, and custom windows", () => {
    expect(parseWindow("auto")).toBe("auto");
    expect(parseWindow("30d")).toBe("30d");
    expect(parseWindow("45d")).toEqual({ days: 45 });
    expect(parseWindow(90)).toEqual({ days: 90 });
  });

  it.each(["0d", "-1d", "3651d", "not-a-window"])("rejects invalid window %s", (value) => {
    expect(() => parseWindow(value)).toThrow(InvalidInputError);
  });

  it("validates formats and ISO timestamps", () => {
    expect(parseOutputFormat("jsonl")).toBe("jsonl");
    expect(parseIsoTimestamp("2026-08-02T00:00:00Z")).toBe("2026-08-02T00:00:00Z");
    expect(() => parseOutputFormat("yaml")).toThrow(InvalidInputError);
    expect(() => parseIsoTimestamp("tomorrow")).toThrow(InvalidInputError);
  });

  it("creates safe defaults and validates limits", () => {
    expect(createConfig("octo/repo", { format: "json", maxApiRequests: 10 })).toMatchObject({
      window: "auto",
      format: "json",
      maxApiRequests: 10,
      save: true,
      noCache: false
    });
    expect(() => createConfig("octo/repo", { budgetMs: 0 })).toThrow(InvalidInputError);
    expect(() => createConfig("octo/repo", { dbPath: " " })).toThrow(InvalidInputError);
  });
});
