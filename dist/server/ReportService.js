"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportService = exports.ReportServiceNeedsUrlError = void 0;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const db_1 = require("./db");
const ContrastProcessor_1 = require("./ContrastProcessor");
const agentConstants_1 = require("./agentConstants");
const issueHelpers_1 = require("./issueHelpers");
const sourceInventory_1 = require("./sourceInventory");
const prompts_1 = require("./prompts");
const SCRIPT_EXTENSIONS = new Set([
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".mjs",
    ".cjs",
]);
const AUDITABLE_EXTENSIONS = new Set([
    ...SCRIPT_EXTENSIONS,
    ...agentConstants_1.STYLESHEET_EXTENSIONS,
    ".html",
    ".htm",
]);
const COMPONENT_FALLBACK_GUIDELINES = [
    {
        wcag_id: "1.1.1",
        description: "Non-text Content: images, icons, and visual-only controls require a text alternative.",
    },
    {
        wcag_id: "1.3.1",
        description: "Info and Relationships: semantic structure, labels, and associations must be programmatically exposed.",
    },
    {
        wcag_id: "1.3.2",
        description: "Meaningful Sequence: DOM and reading order must preserve the intended meaning.",
    },
    {
        wcag_id: "2.1.1",
        description: "Keyboard: all interactive functionality must be operable by keyboard.",
    },
    {
        wcag_id: "2.4.3",
        description: "Focus Order: focus movement must follow a logical order.",
    },
    {
        wcag_id: "2.4.4",
        description: "Link Purpose: link purpose must be clear from its text or context.",
    },
    {
        wcag_id: "2.4.6",
        description: "Headings and Labels: headings and labels must describe topic or purpose.",
    },
    {
        wcag_id: "3.3.2",
        description: "Labels or Instructions: required inputs and controls must provide clear guidance.",
    },
    {
        wcag_id: "4.1.2",
        description: "Name, Role, Value: custom UI components must expose accessible name, role, and state.",
    },
];
class ReportServiceNeedsUrlError extends Error {
    constructor(message) {
        super(message);
        this.needsUrl = true;
        this.name = "ReportServiceNeedsUrlError";
    }
}
exports.ReportServiceNeedsUrlError = ReportServiceNeedsUrlError;
class ResultAccumulator {
    constructor(filePaths) {
        this.completedFiles = new Set();
        this.fragments = [];
        this.expectedFiles = new Set(filePaths.map((filePath) => normalizePath(filePath)));
        this.completionPromise = new Promise((resolve) => {
            this.resolveCompletion = resolve;
            if (this.expectedFiles.size === 0) {
                resolve();
            }
        });
    }
    addFragment(fragment) {
        this.fragments.push(fragment);
    }
    markFileComplete(filePath) {
        this.completedFiles.add(normalizePath(filePath));
        if (this.completedFiles.size >= this.expectedFiles.size) {
            this.resolveCompletion?.();
        }
    }
    waitForCompletion() {
        return this.completionPromise;
    }
    getFragments() {
        return [...this.fragments];
    }
    getFailedCandidates() {
        return this.fragments.flatMap((fragment) => fragment.status === "failed" ? fragment.issues : []);
    }
}
class ReportService {
    constructor(llm, tool) {
        this.llm = llm;
        this.tool = tool;
        this.nextCandidateId = 1;
    }
    async retrieveOrInitiateAudit(params) {
        const targetFilePath = normalizePath(params.filePath);
        const rootPath = normalizePath(params.rootPath);
        try {
            const fileHash = await this.computeFileHash(targetFilePath);
            const cached = (0, db_1.getLatestStoredReportByFilePath)(targetFilePath);
            if (cached && cached.fileHash === fileHash) {
                return {
                    ...cached,
                    source: "opened",
                };
            }
            return await this.generateReport({
                filePath: targetFilePath,
                rootPath,
                projectUrl: params.projectUrl,
                fileHash,
            });
        }
        catch (error) {
            if (error instanceof ReportServiceNeedsUrlError) {
                throw error;
            }
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to retrieve or initiate audit: ${message}`);
        }
    }
    async getReportById(reportId) {
        try {
            const report = (0, db_1.getStoredReportById)(reportId);
            return report ? { ...report, source: "opened" } : null;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch report ${reportId}: ${message}`);
        }
    }
    async getExistingReportForFile(params) {
        try {
            const targetFilePath = normalizePath(params.filePath);
            return (0, db_1.getLatestStoredReportByFilePath)(targetFilePath);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch stored report for file: ${message}`);
        }
    }
    async getExistingReportsForProject(rootPath) {
        try {
            const normalizedRootPath = normalizePath(rootPath);
            const reports = (0, db_1.getLatestStoredReportsByProjectRootPath)(normalizedRootPath);
            if (reports.length === 0) {
                return null;
            }
            const targetFileResults = reports.flatMap((report) => report.results.filter((issue) => normalizePath(issue.filePath) === normalizePath(report.filePath)));
            const groupedIssues = buildGroupedIssues(targetFileResults);
            const fileEntries = reports.map((report) => ({
                filePath: report.filePath,
                issueCount: report.results.filter((issue) => !issue.ignored && normalizePath(issue.filePath) === normalizePath(report.filePath)).length,
            }));
            const latestCreatedAt = reports
                .map((report) => report.createdAt)
                .sort((left, right) => right.localeCompare(left))[0];
            const overallAccessibilityScore = Math.round(reports.reduce((sum, report) => sum + report.overallAccessibilityScore, 0) /
                reports.length);
            return {
                reportId: `project:${normalizedRootPath}`,
                filePath: normalizedRootPath,
                fileHash: "project-stored-reports",
                createdAt: latestCreatedAt,
                source: "opened",
                overallAccessibilityScore,
                dependencies: [],
                results: targetFileResults,
                groupedIssues,
                fileEntries,
                counts: buildSeverityCounts(targetFileResults),
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch stored project reports: ${message}`);
        }
    }
    async generateReport(args) {
        const projectId = (0, db_1.upsertProject)(path.basename(args.rootPath), args.rootPath);
        const scopeFiles = await this.resolveAuditScope(args.filePath, args.rootPath);
        const accumulator = new ResultAccumulator(scopeFiles);
        const fileContents = new Map();
        const fileIds = scopeFiles.map((filePath) => (0, db_1.upsertFile)(projectId, filePath));
        (0, db_1.clearApplicableGuidelinesForFiles)(fileIds);
        (0, db_1.clearAuditResultsForFiles)(fileIds);
        const runtimeReport = await this.runScopedRuntimeAnalysis({
            rootPath: args.rootPath,
            projectUrl: args.projectUrl,
            scopeFiles,
        });
        for (const filePath of scopeFiles) {
            const fileId = (0, db_1.getFileId)(projectId, filePath);
            if (!fileId) {
                accumulator.markFileComplete(filePath);
                continue;
            }
            const content = await fs.readFile(filePath, "utf8");
            fileContents.set(filePath, content);
            (0, db_1.updateFileStatus)(fileId, "analyzing");
            this.seedApplicableGuidelines(filePath, fileId, runtimeReport, args.rootPath);
            const ignoredGuidelines = new Set((0, db_1.getIgnoredGuidelines)(fileId));
            const guidelines = (0, db_1.getApplicableGuidelines)(fileId).filter((guideline) => !ignoredGuidelines.has(guideline.wcag_id) &&
                !(0, ContrastProcessor_1.isContrastGuideline)(guideline.wcag_id));
            if (guidelines.length === 0) {
                accumulator.markFileComplete(filePath);
                continue;
            }
            const threadId = `report-audit-${crypto.randomUUID()}`;
            this.llm.createThread(threadId, prompts_1.AUDIT_SYSTEM_PROMPT);
            await this.llm.send(threadId, (0, prompts_1.buildFilePrimePrompt)(path.basename(filePath), content, (0, sourceInventory_1.extractAuditableElementInventory)(content)));
            for (const guideline of guidelines) {
                try {
                    const reply = await this.llm.send(threadId, (0, prompts_1.buildGuidelineCheckPrompt)(guideline.wcag_id, guideline.description), { json: true });
                    const parsed = JSON.parse(reply);
                    const status = parsed.status === "failed" || parsed.status === "na"
                        ? parsed.status
                        : "passed";
                    const issues = status === "failed"
                        ? (0, issueHelpers_1.dedupeGuidelineIssues)(parsed.issues || []).map((issue) => this.createCandidateIssue({
                            filePath,
                            guideline: guideline.wcag_id,
                            source: "llm",
                            severity: toSeverity(issue.severity),
                            issueDescription: issue.issueDescription || "WCAG violation detected",
                            lineNumber: issue.lineNumber ?? null,
                            selector: issue.selector ?? null,
                            snippet: sanitizeSnippet(issue.snippet),
                            suggestion: issue.suggestion ?? null,
                        }))
                        : [];
                    accumulator.addFragment({
                        fragmentKey: buildFragmentKey(filePath, guideline.wcag_id, "llm"),
                        filePath,
                        guideline: guideline.wcag_id,
                        source: "llm",
                        status,
                        issues,
                    });
                }
                catch (error) {
                    accumulator.addFragment({
                        fragmentKey: buildFragmentKey(filePath, guideline.wcag_id, "llm"),
                        filePath,
                        guideline: guideline.wcag_id,
                        source: "llm",
                        status: "na",
                        issues: [],
                    });
                    console.error(`[ReportService] Failed guideline check ${guideline.wcag_id} for ${filePath}:`, error);
                }
            }
            this.llm.dropThread(threadId);
            accumulator.markFileComplete(filePath);
        }
        this.addRuntimeFragments(accumulator, runtimeReport, args.rootPath, scopeFiles);
        await accumulator.waitForCompletion();
        const finalIssues = await this.finalizeWithJudge({
            targetFilePath: args.filePath,
            scopeFiles,
            accumulator,
            fileContents,
        });
        const persistedReport = this.persistFinalReport({
            projectId,
            targetFilePath: args.filePath,
            fileHash: args.fileHash,
            scopeFiles,
            accumulator,
            finalIssues,
        });
        return persistedReport;
    }
    async runScopedRuntimeAnalysis(args) {
        const result = await this.tool.runWcagMapper({
            projectRoot: args.rootPath,
            url: args.projectUrl,
        });
        if (!result.success) {
            if (result.needsUrl) {
                throw new ReportServiceNeedsUrlError("Runtime analysis requires the running project URL to generate a fresh report.");
            }
            throw new Error(result.error || "wcag_mapper failed");
        }
        const scopeSet = new Set(args.scopeFiles.map((filePath) => normalizePath(filePath)));
        return {
            ...result.report,
            files: result.report.files.filter((file) => {
                const fullPath = normalizePath(path.isAbsolute(file.path) ? file.path : path.join(args.rootPath, file.path));
                return scopeSet.has(fullPath);
            }),
        };
    }
    seedApplicableGuidelines(filePath, fileId, runtimeReport, rootPath) {
        const runtimeFile = runtimeReport?.files.find((file) => {
            const fullPath = normalizePath(path.isAbsolute(file.path) ? file.path : path.join(rootPath, file.path));
            return fullPath === normalizePath(filePath);
        });
        (0, db_1.markFileRuntimeAnalyzed)(fileId, Boolean(runtimeReport));
        if (runtimeFile) {
            for (const guideline of runtimeFile.guidelines) {
                if ((0, ContrastProcessor_1.isContrastGuideline)(guideline.scId)) {
                    continue;
                }
                (0, db_1.upsertApplicableGuideline)(fileId, guideline.scId, `${guideline.title} [${guideline.category}] (Level ${guideline.level})`);
            }
        }
        const existing = (0, db_1.getApplicableGuidelines)(fileId);
        if (existing.length > 0) {
            return;
        }
        const fallbackGuidelines = this.isStylesheetFile(filePath)
            ? agentConstants_1.STYLESHEET_FALLBACK_GUIDELINES
            : COMPONENT_FALLBACK_GUIDELINES;
        for (const guideline of fallbackGuidelines) {
            (0, db_1.upsertApplicableGuideline)(fileId, guideline.wcag_id, guideline.description);
        }
    }
    addRuntimeFragments(accumulator, runtimeReport, rootPath, scopeFiles) {
        if (!runtimeReport) {
            return;
        }
        const contrastIssues = (0, ContrastProcessor_1.extractContrastFailures)(runtimeReport).map((issue) => ({
            ...issue,
            filePath: normalizePath(path.isAbsolute(issue.filePath)
                ? issue.filePath
                : path.join(rootPath, issue.filePath)),
        }));
        for (const filePath of scopeFiles) {
            const fileIssues = (0, ContrastProcessor_1.getContrastIssuesForFile)(contrastIssues, filePath);
            if (fileIssues.length === 0) {
                continue;
            }
            const grouped = new Map();
            for (const issue of fileIssues) {
                const fragmentKey = buildFragmentKey(filePath, issue.guideline, "runtime");
                const bucket = grouped.get(fragmentKey) || [];
                bucket.push(this.createCandidateIssue({
                    filePath,
                    guideline: issue.guideline,
                    source: "runtime",
                    severity: toSeverity(issue.severity),
                    issueDescription: issue.issueDescription,
                    lineNumber: null,
                    selector: issue.selector ?? null,
                    snippet: sanitizeSnippet(issue.snippet),
                    suggestion: issue.suggestion || null,
                }));
                grouped.set(fragmentKey, bucket);
            }
            for (const [fragmentKey, issues] of grouped) {
                accumulator.addFragment({
                    fragmentKey,
                    filePath,
                    guideline: issues[0]?.guideline || "1.4.3",
                    source: "runtime",
                    status: "failed",
                    issues,
                });
            }
        }
    }
    async finalizeWithJudge(args) {
        const candidates = args.accumulator.getFailedCandidates();
        if (candidates.length === 0) {
            return [];
        }
        const filesForJudge = args.scopeFiles.map((filePath) => ({
            filePath,
            role: filePath === args.targetFilePath ? "target" : "dependency",
            content: clipLargeText(args.fileContents.get(filePath) || ""),
        }));
        const threadId = `report-judge-${crypto.randomUUID()}`;
        this.llm.createThread(threadId, prompts_1.REPORT_JUDGE_SYSTEM_PROMPT);
        try {
            const reply = await this.llm.send(threadId, (0, prompts_1.buildReportJudgePrompt)({
                targetFilePath: args.targetFilePath,
                dependencyPaths: args.scopeFiles.filter((filePath) => filePath !== args.targetFilePath),
                files: filesForJudge,
                candidates: candidates.map((candidate) => ({
                    candidateId: candidate.candidateId,
                    filePath: candidate.filePath,
                    guideline: candidate.guideline,
                    severity: candidate.severity,
                    source: candidate.source,
                    issueDescription: candidate.issueDescription,
                    lineNumber: candidate.lineNumber,
                    selector: candidate.selector,
                    snippet: candidate.snippet,
                    suggestion: candidate.suggestion,
                })),
            }), { json: true });
            const parsed = JSON.parse(reply);
            const confirmed = new Map((parsed.confirmedIssues || []).map((item) => [item.candidateId, item.confidence]));
            return candidates
                .filter((candidate) => confirmed.has(candidate.candidateId))
                .map((candidate) => ({
                ...candidate,
                confidence: confirmed.get(candidate.candidateId) || "medium",
            }));
        }
        finally {
            this.llm.dropThread(threadId);
        }
    }
    persistFinalReport(args) {
        const issueIdsByFile = new Map();
        for (const issue of args.finalIssues) {
            const fileId = (0, db_1.getFileId)(args.projectId, issue.filePath);
            if (!fileId) {
                continue;
            }
            const auditResultId = (0, db_1.insertAuditResult)(fileId, issue.issueDescription, issue.guideline, issue.severity, issue.lineNumber, issue.selector, issue.snippet, issue.suggestion, issue.source);
            const bucket = issueIdsByFile.get(issue.filePath) || [];
            bucket.push(auditResultId);
            issueIdsByFile.set(issue.filePath, bucket);
        }
        const finalResults = args.finalIssues.map((issue) => {
            const issueIds = issueIdsByFile.get(issue.filePath) || [];
            const issueId = issueIds.shift();
            issueIdsByFile.set(issue.filePath, issueIds);
            return {
                id: String(issueId || issue.candidateId),
                filePath: issue.filePath,
                guideline: issue.guideline,
                severity: issue.severity,
                source: issue.source,
                snippet: issue.snippet,
                ignored: false,
                lineNumber: issue.lineNumber ?? undefined,
                selector: issue.selector ?? undefined,
                suggestion: issue.suggestion ?? undefined,
                issueDescription: issue.issueDescription,
                confidence: issue.confidence,
            };
        });
        const fragments = args.accumulator.getFragments();
        const failingFragmentKeys = new Set(args.finalIssues.map((issue) => issue.fragmentKey));
        for (const filePath of args.scopeFiles) {
            const fileId = (0, db_1.getFileId)(args.projectId, filePath);
            if (!fileId) {
                continue;
            }
            const fileFragments = fragments.filter((fragment) => fragment.filePath === filePath);
            const totalChecks = fileFragments.length;
            const failingChecks = fileFragments.filter((fragment) => fragment.status === "failed" && failingFragmentKeys.has(fragment.fragmentKey)).length;
            const score = totalChecks === 0
                ? 100
                : Math.max(0, Math.round(((totalChecks - failingChecks) / totalChecks) * 100));
            (0, db_1.updateFileStatus)(fileId, "done", score);
        }
        const groupedIssues = buildGroupedIssues(finalResults);
        const fileEntries = buildFileEntries(groupedIssues);
        const counts = buildSeverityCounts(finalResults);
        const overallAccessibilityScore = computeOverallScore(fragments, failingFragmentKeys);
        return (0, db_1.insertStoredReport)({
            projectId: args.projectId,
            filePath: args.targetFilePath,
            fileHash: args.fileHash,
            overallAccessibilityScore,
            payload: {
                overallAccessibilityScore,
                dependencies: args.scopeFiles.filter((filePath) => filePath !== args.targetFilePath),
                results: finalResults,
                groupedIssues,
                fileEntries,
                counts,
            },
        });
    }
    async computeFileHash(filePath) {
        const content = await fs.readFile(filePath);
        return crypto.createHash("sha256").update(content).digest("hex");
    }
    async resolveAuditScope(entryFilePath, rootPath) {
        const resolvedRoot = normalizePath(rootPath);
        const visited = new Set();
        const ordered = [];
        const visit = async (filePath) => {
            const normalizedFilePath = normalizePath(filePath);
            if (visited.has(normalizedFilePath)) {
                return;
            }
            if (!normalizedFilePath.startsWith(resolvedRoot)) {
                return;
            }
            const extension = path.extname(normalizedFilePath).toLowerCase();
            if (!AUDITABLE_EXTENSIONS.has(extension)) {
                return;
            }
            visited.add(normalizedFilePath);
            ordered.push(normalizedFilePath);
            if (!SCRIPT_EXTENSIONS.has(extension) && !agentConstants_1.STYLESHEET_EXTENSIONS.has(extension)) {
                return;
            }
            let content = "";
            try {
                content = await fs.readFile(normalizedFilePath, "utf8");
            }
            catch {
                return;
            }
            const dependencies = extractLocalDependencySpecifiers(content, extension)
                .map((specifier) => resolveDependencySpecifier(normalizedFilePath, specifier))
                .filter((candidate) => Boolean(candidate));
            for (const dependency of dependencies) {
                await visit(dependency);
            }
        };
        await visit(entryFilePath);
        return ordered;
    }
    isStylesheetFile(filePath) {
        return agentConstants_1.STYLESHEET_EXTENSIONS.has(path.extname(filePath).toLowerCase());
    }
    createCandidateIssue(input) {
        return {
            ...input,
            candidateId: `candidate-${this.nextCandidateId++}`,
            fragmentKey: buildFragmentKey(input.filePath, input.guideline, input.source),
        };
    }
}
exports.ReportService = ReportService;
function normalizePath(filePath) {
    return path.resolve(filePath).replace(/\\/g, "/");
}
function buildFragmentKey(filePath, guideline, source) {
    return `${normalizePath(filePath)}|${guideline}|${source}`;
}
function toSeverity(value) {
    if (value === "error" || value === "info") {
        return value;
    }
    return "warning";
}
function sanitizeSnippet(value) {
    return String(value || "").replace(/\r\n/g, "\n").trim();
}
function clipLargeText(value, maxLength = 12000) {
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, maxLength)}\n/* truncated for judge context */`;
}
function extractLocalDependencySpecifiers(content, extension) {
    const matches = new Set();
    const patterns = [
        /import\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g,
        /export\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g,
        /require\(\s*["']([^"']+)["']\s*\)/g,
        /import\(\s*["']([^"']+)["']\s*\)/g,
    ];
    for (const pattern of patterns) {
        for (const match of content.matchAll(pattern)) {
            const specifier = match[1];
            if (specifier?.startsWith(".")) {
                matches.add(specifier);
            }
        }
    }
    if (agentConstants_1.STYLESHEET_EXTENSIONS.has(extension)) {
        for (const match of content.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/g)) {
            const specifier = match[1];
            if (specifier?.startsWith(".")) {
                matches.add(specifier);
            }
        }
    }
    return [...matches];
}
function resolveDependencySpecifier(importerPath, specifier) {
    const importerDir = path.dirname(importerPath);
    const cleanedSpecifier = specifier.replace(/[?#].*$/, "");
    const hasExplicitExtension = path.extname(cleanedSpecifier).length > 0;
    const basePath = normalizePath(path.resolve(importerDir, cleanedSpecifier));
    const candidates = hasExplicitExtension
        ? [basePath]
        : [
            ...[...AUDITABLE_EXTENSIONS].map((extension) => `${basePath}${extension}`),
            ...[...AUDITABLE_EXTENSIONS].map((extension) => normalizePath(path.join(basePath, `index${extension}`))),
        ];
    for (const candidate of candidates) {
        try {
            const stat = require("fs").statSync(candidate);
            if (stat.isFile()) {
                return normalizePath(candidate);
            }
        }
        catch {
            // ignore missing candidates
        }
    }
    return null;
}
function buildGroupedIssues(results) {
    const groups = new Map();
    for (const issue of results) {
        const key = [
            issue.filePath,
            issue.lineNumber ?? "",
            issue.selector || "",
            sanitizeSnippet(issue.snippet).slice(0, 160),
        ].join("|");
        const existing = groups.get(key);
        if (existing) {
            existing.issues.push(issue);
            continue;
        }
        groups.set(key, {
            key,
            filePath: issue.filePath,
            lineNumber: issue.lineNumber,
            selector: issue.selector,
            label: buildGroupLabel(issue),
            issues: [issue],
        });
    }
    return [...groups.values()];
}
function buildGroupLabel(issue) {
    if (issue.selector) {
        return issue.selector;
    }
    if (issue.lineNumber !== undefined) {
        return `Line ${issue.lineNumber}`;
    }
    return issue.guideline;
}
function buildFileEntries(groupedIssues) {
    const counts = new Map();
    for (const group of groupedIssues) {
        const visibleIssues = group.issues.filter((issue) => !issue.ignored).length;
        counts.set(group.filePath, (counts.get(group.filePath) || 0) + visibleIssues);
    }
    return [...counts.entries()].map(([filePath, issueCount]) => ({
        filePath,
        issueCount,
    }));
}
function buildSeverityCounts(results) {
    return results.reduce((acc, issue) => {
        if (!issue.ignored) {
            const severity = issue.severity === "error" ||
                issue.severity === "warning" ||
                issue.severity === "info"
                ? issue.severity
                : "warning";
            acc[severity] += 1;
        }
        return acc;
    }, { error: 0, warning: 0, info: 0 });
}
function computeOverallScore(fragments, failingFragmentKeys) {
    if (fragments.length === 0) {
        return 100;
    }
    const failedChecks = fragments.filter((fragment) => fragment.status === "failed" && failingFragmentKeys.has(fragment.fragmentKey)).length;
    return Math.max(0, Math.round(((fragments.length - failedChecks) / fragments.length) * 100));
}
//# sourceMappingURL=ReportService.js.map