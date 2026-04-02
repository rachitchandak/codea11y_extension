"use strict";
/* ------------------------------------------------------------------ *
 *  Issue deduplication helpers used by MainAgent audit phase           *
 * ------------------------------------------------------------------ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeIssueText = normalizeIssueText;
exports.nullableIssueText = nullableIssueText;
exports.normalizeSeverity = normalizeSeverity;
exports.severityRank = severityRank;
exports.dedupeGuidelineIssues = dedupeGuidelineIssues;
function normalizeIssueText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}
function nullableIssueText(value) {
    const normalized = normalizeIssueText(value);
    return normalized || null;
}
function normalizeSeverity(severity) {
    const normalized = String(severity || "warning").toLowerCase();
    if (normalized === "error" || normalized === "warning" || normalized === "info") {
        return normalized;
    }
    return "warning";
}
function severityRank(severity) {
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
function buildIssueDedupeKey(issue) {
    return [
        issue.lineNumber ?? "",
        issue.selector || "",
        issue.snippet || "",
        issue.issueDescription,
    ].join("|");
}
function dedupeGuidelineIssues(issues) {
    const deduped = new Map();
    for (const issue of issues || []) {
        const normalized = {
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
        const preferIncoming = severityRank(normalized.severity) > severityRank(existing.severity);
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
//# sourceMappingURL=issueHelpers.js.map