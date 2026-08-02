export const EXIT_CODES = {
  success: 0,
  analysisFailure: 1,
  invalidInput: 2,
  materialLimitations: 3
} as const;

export type ErrorCode =
  | "AUTHENTICATION_ERROR"
  | "PERMISSION_ERROR"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "SERVER_ERROR"
  | "MALFORMED_RESPONSE"
  | "INVALID_INPUT"
  | "BUDGET_EXCEEDED"
  | "INCOMPLETE_DATA"
  | "CANCELLED"
  | "ANALYSIS_ERROR";

function redact(message: string): string {
  return message
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, "[REDACTED_TOKEN]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED_TOKEN]");
}

export class OssEvalError extends Error {
  readonly code: ErrorCode;
  readonly exitCode: number;

  constructor(code: ErrorCode, message: string, exitCode: number = EXIT_CODES.analysisFailure) {
    super(redact(message));
    this.name = "OssEvalError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

export class AuthenticationError extends OssEvalError {
  constructor(message = "GitHub authentication is required") {
    super("AUTHENTICATION_ERROR", message);
    this.name = "AuthenticationError";
  }
}

export class PermissionError extends OssEvalError {
  constructor(message = "GitHub permission is insufficient for this operation") {
    super("PERMISSION_ERROR", message);
    this.name = "PermissionError";
  }
}

export class NotFoundError extends OssEvalError {
  constructor(message = "The requested GitHub resource was not found") {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends OssEvalError {
  constructor(message = "GitHub rate limit prevents this operation") {
    super("RATE_LIMIT", message);
    this.name = "RateLimitError";
  }
}

export class ServerError extends OssEvalError {
  constructor(message = "GitHub returned a server error") {
    super("SERVER_ERROR", message);
    this.name = "ServerError";
  }
}

export class MalformedResponseError extends OssEvalError {
  constructor(message = "GitHub returned a malformed response") {
    super("MALFORMED_RESPONSE", message);
    this.name = "MalformedResponseError";
  }
}

export class InvalidInputError extends OssEvalError {
  constructor(message: string) {
    super("INVALID_INPUT", message, EXIT_CODES.invalidInput);
    this.name = "InvalidInputError";
  }
}

export class BudgetError extends OssEvalError {
  constructor(message = "The analysis budget was exceeded") {
    super("BUDGET_EXCEEDED", message);
    this.name = "BudgetError";
  }
}

export class IncompleteDataError extends OssEvalError {
  constructor(message = "The analysis completed with incomplete data") {
    super("INCOMPLETE_DATA", message, EXIT_CODES.materialLimitations);
    this.name = "IncompleteDataError";
  }
}

export class CancellationError extends OssEvalError {
  constructor(message = "The analysis was cancelled") {
    super("CANCELLED", message);
    this.name = "CancellationError";
  }
}

export class AnalysisError extends OssEvalError {
  constructor(message: string) {
    super("ANALYSIS_ERROR", message);
    this.name = "AnalysisError";
  }
}

export function exitCodeForError(error: unknown): number {
  return error instanceof OssEvalError ? error.exitCode : EXIT_CODES.analysisFailure;
}
