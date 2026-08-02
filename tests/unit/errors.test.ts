import { describe, expect, it } from "vitest";
import { AuthenticationError, InvalidInputError, exitCodeForError } from "../../src/core/errors.js";

describe("stable errors", () => {
  it("maps invalid input to exit code 2", () => {
    const error = new InvalidInputError("bad repository");

    expect(error.code).toBe("INVALID_INPUT");
    expect(exitCodeForError(error)).toBe(2);
  });

  it("redacts token-shaped values from messages", () => {
    const error = new AuthenticationError("invalid ghp_1234567890secret token");

    expect(error.message).not.toContain("ghp_");
    expect(error.message).toContain("[REDACTED_TOKEN]");
  });

  it("maps unknown errors to analysis failure", () => {
    expect(exitCodeForError(new Error("failure"))).toBe(1);
  });
});
