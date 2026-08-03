import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "oss-eval-package-"));
const packOutput = execFileSync("npm", ["pack", "--pack-destination", directory, "--json"], { encoding: "utf8" });
const [{ filename, files }] = JSON.parse(packOutput);
const paths = files.map((file) => file.path);
for (const required of ["dist/index.js", "dist/index.d.ts", "dist/cli/index.js", "dist/mcp/server.js", "schema/report.schema.json"]) {
  if (!paths.includes(required)) throw new Error(`Packed artifact is missing ${required}`);
}
if (paths.some((path) => /(?:^|\/)(?:\.env|history\.sqlite3|raw)(?:$|\/)/.test(path))) throw new Error("Packed artifact contains private or raw data");

const consumer = join(directory, "consumer");
execFileSync("mkdir", [consumer]);
writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(directory, filename)], { cwd: consumer, stdio: "ignore" });
const output = execFileSync("node", ["--input-type=module", "-e",
  "import { createConfig, evaluateRepository } from 'oss-eval'; console.log(typeof createConfig, typeof evaluateRepository)"],
  { cwd: consumer, encoding: "utf8" }).trim();
if (output !== "function function") throw new Error(`Consumer import failed: ${output}`);
const schema = JSON.parse(readFileSync(join(consumer, "node_modules", "oss-eval", "schema", "report.schema.json"), "utf8"));
if (schema.title !== "oss-eval report") throw new Error("Report schema is invalid or missing");
const version = execFileSync(join(consumer, "node_modules", ".bin", "oss-eval"), ["version"], { encoding: "utf8" }).trim();
if (version !== "oss-eval 0.1.0") throw new Error(`Packed CLI failed: ${version}`);
