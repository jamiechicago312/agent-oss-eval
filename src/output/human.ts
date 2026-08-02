import type { Report } from "../core/types.js";

export function formatHumanReport(report: Report): string {
  const lines = [
    `oss-eval ${report.target.full_name}`,
    `Completeness: ${report.completeness}`,
    `Window: ${report.window.start} to ${report.window.end} (${report.window.days}d)`,
    "",
    "Metrics:"
  ];
  for (const [name, metric] of Object.entries(report.metrics)) {
    const marker = metric.confidence === "partial" || metric.confidence === "unavailable" ? "*" : "";
    lines.push(`- ${name}${marker}: ${JSON.stringify(metric.value)} (${metric.confidence}, n=${metric.sample_size})`);
  }
  const hasMarkedMetrics = Object.values(report.metrics).some(
    (metric) => metric.confidence === "partial" || metric.confidence === "unavailable"
  );
  if (report.limitations.length > 0 || hasMarkedMetrics) {
    lines.push("", "Limitations:");
    for (const limitation of report.limitations) lines.push(`- ${limitation}`);
    if (hasMarkedMetrics) lines.push("- * metric is partial or unavailable.");
  }
  return lines.join("\n");
}
