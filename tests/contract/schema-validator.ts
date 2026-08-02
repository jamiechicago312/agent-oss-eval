import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

interface AjvInstance {
  compile(schema: unknown): (data: unknown) => boolean;
}

type AjvConstructor = new (options?: { strict?: boolean }) => AjvInstance;

function resolveAjv(module: unknown): AjvConstructor {
  if (typeof module === "function") return module as AjvConstructor;
  if (typeof module === "object" && module !== null) {
    const exports = module as Record<string, unknown>;
    for (const candidate of [exports.default, exports.Ajv]) {
      if (typeof candidate === "function") return candidate as AjvConstructor;
    }
  }
  throw new Error("Unable to load the Ajv constructor");
}

const require = createRequire(import.meta.url);
const Ajv = resolveAjv(require("ajv"));
const schema = JSON.parse(
  readFileSync(new URL("../../schema/report.schema.json", import.meta.url), "utf8")
);
const validate = new Ajv({ strict: false }).compile(schema);

export function validateReport(report: unknown): boolean {
  return validate(report);
}
