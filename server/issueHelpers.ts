/* ------------------------------------------------------------------ *
 *  Issue deduplication helpers used by MainAgent audit phase           *
 * ------------------------------------------------------------------ */

export function normalizeIssueText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function nullableIssueText(value: unknown): string | null {
  const normalized = normalizeIssueText(value);
  return normalized || null;
}

export function normalizeSeverity(severity: string | undefined): string {
  const normalized = String(severity || "warning").toLowerCase();
  if (normalized === "error" || normalized === "warning" || normalized === "info") {
    return normalized;
  }
  return "warning";
}

export function severityRank(severity: string): number {
  switch (severity) {
    case "error":
      return 3;
    case "warning":
      return 2;
    case "info":
      return 1;
    default:
      return 0;
  }
}

interface NormalizedIssue {
  issueDescription: string;
  severity: string;
  lineNumber: number | null;
  selector: string | null;
  snippet: string | null;
  suggestion: string | null;
}

function buildIssueDedupeKey(issue: {
  issueDescription: string;
  lineNumber: number | null;
  selector: string | null;
  snippet: string | null;
}): string {
  return [
    issue.lineNumber ?? "",
    issue.selector || "",
    issue.snippet || "",
    issue.issueDescription,
  ].join("|");
}

export function dedupeGuidelineIssues(
  issues: Array<{
    issueDescription?: string;
    severity?: string;
    lineNumber?: number | null;
    selector?: string | null;
    snippet?: string | null;
    suggestion?: string | null;
  }>
): NormalizedIssue[] {
  const deduped = new Map<string, NormalizedIssue>();

  for (const issue of issues || []) {
    const normalized: NormalizedIssue = {
      issueDescription: normalizeIssueText(issue.issueDescription),
      severity: normalizeSeverity(issue.severity),
      lineNumber: issue.lineNumber ?? null,
      selector: nullableIssueText(issue.selector),
      snippet: nullableIssueText(issue.snippet),
      suggestion: nullableIssueText(issue.suggestion),
    };

    const dedupeKey = buildIssueDedupeKey(normalized);
    const existing = deduped.get(dedupeKey);
    if (!existing) {
      deduped.set(dedupeKey, normalized);
      continue;
    }

    const preferIncoming =
      severityRank(normalized.severity) > severityRank(existing.severity);
    const primary = preferIncoming ? normalized : existing;
    const secondary = preferIncoming ? existing : normalized;

    deduped.set(dedupeKey, {
      issueDescription: primary.issueDescription || secondary.issueDescription,
      severity: primary.severity || secondary.severity || "warning",
      lineNumber: primary.lineNumber ?? secondary.lineNumber ?? null,
      selector: primary.selector || secondary.selector || null,
      snippet: primary.snippet || secondary.snippet || null,
      suggestion: primary.suggestion || secondary.suggestion || null,
    });
  }

  return [...deduped.values()];
}
