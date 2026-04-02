import type { AuditResult, Severity } from "../../shared/messages";
export declare function normalizeIssueText(value: string | null | undefined): string;
export declare function severityRank(severity: Severity | string): number;
export declare function normalizeGuidelineLabel(label: string): string;
export declare function sanitizeIssueSnippet(value: string | null | undefined): string;
export declare function buildIssueMergeKey(issue: AuditResult): string;
export declare function buildComponentGroupKey(issue: AuditResult): string;
export declare function getComponentGroupLabel(issue: AuditResult): string;
export declare function mergeIssues(existing: AuditResult, incoming: AuditResult): AuditResult;
