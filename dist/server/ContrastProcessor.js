"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isContrastGuideline = isContrastGuideline;
exports.extractContrastFailures = extractContrastFailures;
exports.formatContrastFactsForJudge = formatContrastFactsForJudge;
exports.getContrastIssuesForFile = getContrastIssuesForFile;
/* ------------------------------------------------------------------ *
 *  Contrast guideline IDs (numeric WCAG SC identifiers)               *
 * ------------------------------------------------------------------ */
const CONTRAST_NUMERIC_IDS = new Set(["1.4.3", "1.4.6", "1.4.11"]);
/* ------------------------------------------------------------------ *
 *  Guideline identification                                           *
 * ------------------------------------------------------------------ */
/**
 * Returns true if the given WCAG ID corresponds to a colour-contrast
 * success criterion (1.4.3, 1.4.6 or 1.4.11).
 */
function isContrastGuideline(wcagId) {
    const numericMatch = wcagId.match(/(\d+\.\d+\.\d+)/);
    if (!numericMatch)
        return false;
    return CONTRAST_NUMERIC_IDS.has(numericMatch[1]);
}
/* ------------------------------------------------------------------ *
 *  Extract & deduplicate contrast failures                            *
 * ------------------------------------------------------------------ */
/**
 * Walk the wcag_mapper report and pull out every *failing* contrast
 * finding, deduplicated per file by (selector ∥ foreground+background)
 * and contrast ratio.
 */
function extractContrastFailures(report) {
    const issues = [];
    for (const file of report.files) {
        if (!file.contrastFindings)
            continue;
        for (const finding of file.contrastFindings) {
            if (finding.passes)
                continue;
            // AA-level text contrast is always 1.4.3; enhanced (AAA) would be 1.4.6
            const guideline = finding.requiredRatio > 4.5 ? "1.4.6" : "1.4.3";
            issues.push({
                filePath: file.path,
                foreground: finding.foreground,
                background: finding.background,
                contrastRatio: finding.contrastRatio,
                requiredRatio: finding.requiredRatio,
                isLargeText: finding.isLargeText,
                guideline,
                severity: "error",
                issueDescription: buildDescription(finding),
                selector: finding.domSelector ?? null,
                snippet: finding.text
                    ? `Text: "${finding.text.slice(0, 120)}"`
                    : null,
                suggestion: buildSuggestion(finding),
            });
        }
    }
    return deduplicateContrastIssues(issues);
}
/* ------------------------------------------------------------------ *
 *  Formatting helpers                                                 *
 * ------------------------------------------------------------------ */
function buildDescription(f) {
    const textType = f.isLargeText ? "Large text" : "Normal text";
    return (`${textType} contrast ratio ${f.contrastRatio}:1 does not meet ` +
        `the required ${f.requiredRatio}:1. ` +
        `Foreground: ${f.foreground}, Background: ${f.background}.`);
}
function buildSuggestion(f) {
    return (`Adjust the foreground (${f.foreground}) or background ` +
        `(${f.background}) colour to achieve at least a ` +
        `${f.requiredRatio}:1 contrast ratio.`);
}
/* ------------------------------------------------------------------ *
 *  Deduplication                                                      *
 * ------------------------------------------------------------------ */
/**
 * Deduplicate by (filePath + selector ∥ fg+bg) + requiredRatio.
 * When duplicates collide, the lowest (worst) contrast ratio wins.
 */
function deduplicateContrastIssues(issues) {
    const map = new Map();
    for (const issue of issues) {
        const selectorKey = issue.selector || `${issue.foreground}|${issue.background}`;
        const key = `${issue.filePath}|${selectorKey}|${issue.requiredRatio}`;
        const existing = map.get(key);
        if (!existing || issue.contrastRatio < existing.contrastRatio) {
            map.set(key, issue);
        }
    }
    return [...map.values()];
}
/* ------------------------------------------------------------------ *
 *  Judge-phase formatting                                             *
 * ------------------------------------------------------------------ */
/**
 * Build the "Immutable Facts" block that is injected into the
 * LLM-as-a-Judge validation prompt.
 */
function formatContrastFactsForJudge(issues) {
    if (issues.length === 0)
        return "";
    const lines = issues.map((issue, idx) => `  ${idx + 1}. [${issue.guideline}] ${issue.issueDescription}`);
    return ("The following contrast issues have already been verified by a " +
        "deterministic runtime engine (wcag_mapper). Do NOT re-evaluate " +
        "them. They are confirmed failures:\n" +
        lines.join("\n"));
}
/**
 * Return only the contrast issues that belong to a specific file.
 */
function getContrastIssuesForFile(allIssues, filePath) {
    return allIssues.filter((issue) => {
        const a = issue.filePath.replace(/\\/g, "/");
        const b = filePath.replace(/\\/g, "/");
        return a === b || a.endsWith(b) || b.endsWith(a);
    });
}
//# sourceMappingURL=ContrastProcessor.js.map