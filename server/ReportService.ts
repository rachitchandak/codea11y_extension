import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { LLMClient } from "./LLMClient";
import { ToolWrapper, WcagMapperReport } from "./ToolWrapper";
import {
  clearApplicableGuidelinesForFiles,
  clearAuditResultsForFiles,
  getApplicableGuidelines,
  getFileId,
  getIgnoredGuidelines,
  getLatestStoredReportByFilePath,
  getLatestStoredReportsByProjectRootPath,
  getStoredReportById,
  insertAuditResult,
  insertStoredReport,
  markFileRuntimeAnalyzed,
  StoredReportPayload,
  updateFileStatus,
  upsertApplicableGuideline,
  upsertFile,
  upsertProject,
} from "./db";
import {
  extractContrastFailures,
  getContrastIssuesForFile,
  isContrastGuideline,
} from "./ContrastProcessor";
import { STYLESHEET_EXTENSIONS, STYLESHEET_FALLBACK_GUIDELINES } from "./agentConstants";
import { dedupeGuidelineIssues } from "./issueHelpers";
import { extractAuditableElementInventory } from "./sourceInventory";
import {
  AUDIT_SYSTEM_PROMPT,
  REPORT_JUDGE_SYSTEM_PROMPT,
  buildFilePrimePrompt,
  buildGuidelineCheckPrompt,
  buildReportJudgePrompt,
} from "./prompts";

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
  ...STYLESHEET_EXTENSIONS,
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

export class ReportServiceNeedsUrlError extends Error {
  readonly needsUrl = true;

  constructor(message: string) {
    super(message);
    this.name = "ReportServiceNeedsUrlError";
  }
}

interface RetrieveOrInitiateAuditParams {
  filePath: string;
  rootPath: string;
  projectUrl?: string;
}

interface ExistingReportLookupParams {
  filePath: string;
  rootPath: string;
}

interface CandidateIssue {
  candidateId: string;
  fragmentKey: string;
  filePath: string;
  guideline: string;
  severity: "error" | "warning" | "info";
  source: "llm" | "runtime";
  issueDescription: string;
  lineNumber: number | null;
  selector: string | null;
  snippet: string;
  suggestion: string | null;
}

interface AuditFragment {
  fragmentKey: string;
  filePath: string;
  guideline: string;
  source: "llm" | "runtime";
  status: "passed" | "failed" | "na";
  issues: CandidateIssue[];
}

interface JudgeDecision {
  candidateId: string;
  confidence: "high" | "medium" | "low";
}

interface FinalIssue extends CandidateIssue {
  confidence: "high" | "medium" | "low";
}

class ResultAccumulator {
  private readonly expectedFiles: Set<string>;
  private readonly completedFiles = new Set<string>();
  private readonly fragments: AuditFragment[] = [];
  private resolveCompletion?: () => void;
  private readonly completionPromise: Promise<void>;

  constructor(filePaths: string[]) {
    this.expectedFiles = new Set(filePaths.map((filePath) => normalizePath(filePath)));
    this.completionPromise = new Promise<void>((resolve) => {
      this.resolveCompletion = resolve;
      if (this.expectedFiles.size === 0) {
        resolve();
      }
    });
  }

  addFragment(fragment: AuditFragment): void {
    this.fragments.push(fragment);
  }

  markFileComplete(filePath: string): void {
    this.completedFiles.add(normalizePath(filePath));
    if (this.completedFiles.size >= this.expectedFiles.size) {
      this.resolveCompletion?.();
    }
  }

  waitForCompletion(): Promise<void> {
    return this.completionPromise;
  }

  getFragments(): AuditFragment[] {
    return [...this.fragments];
  }

  getFailedCandidates(): CandidateIssue[] {
    return this.fragments.flatMap((fragment) =>
      fragment.status === "failed" ? fragment.issues : []
    );
  }
}

export class ReportService {
  private nextCandidateId = 1;

  constructor(
    private readonly llm: LLMClient,
    private readonly tool: ToolWrapper
  ) {}

  async retrieveOrInitiateAudit(
    params: RetrieveOrInitiateAuditParams
  ): Promise<StoredReportPayload> {
    const targetFilePath = normalizePath(params.filePath);
    const rootPath = normalizePath(params.rootPath);

    try {
      const fileHash = await this.computeFileHash(targetFilePath);
      const cached = getLatestStoredReportByFilePath(targetFilePath);

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
    } catch (error) {
      if (error instanceof ReportServiceNeedsUrlError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to retrieve or initiate audit: ${message}`);
    }
  }

  async getReportById(reportId: number): Promise<StoredReportPayload | null> {
    try {
      const report = getStoredReportById(reportId);
      return report ? { ...report, source: "opened" } : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch report ${reportId}: ${message}`);
    }
  }

  async getExistingReportForFile(
    params: ExistingReportLookupParams
  ): Promise<StoredReportPayload | null> {
    try {
      const targetFilePath = normalizePath(params.filePath);
      return getLatestStoredReportByFilePath(targetFilePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch stored report for file: ${message}`);
    }
  }

  async getExistingReportsForProject(rootPath: string): Promise<StoredReportPayload | null> {
    try {
      const normalizedRootPath = normalizePath(rootPath);
      const reports = getLatestStoredReportsByProjectRootPath(normalizedRootPath);
      if (reports.length === 0) {
        return null;
      }

      const targetFileResults = reports.flatMap((report) =>
        report.results.filter((issue) => normalizePath(issue.filePath) === normalizePath(report.filePath))
      );

      const groupedIssues = buildGroupedIssues(targetFileResults);
      const fileEntries = reports.map((report) => ({
        filePath: report.filePath,
        issueCount: report.results.filter(
          (issue) =>
            !issue.ignored && normalizePath(issue.filePath) === normalizePath(report.filePath)
        ).length,
      }));

      const latestCreatedAt = reports
        .map((report) => report.createdAt)
        .sort((left, right) => right.localeCompare(left))[0];

      const overallAccessibilityScore = Math.round(
        reports.reduce((sum, report) => sum + report.overallAccessibilityScore, 0) /
          reports.length
      );

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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch stored project reports: ${message}`);
    }
  }

  private async generateReport(args: {
    filePath: string;
    rootPath: string;
    projectUrl?: string;
    fileHash: string;
  }): Promise<StoredReportPayload> {
    const projectId = upsertProject(path.basename(args.rootPath), args.rootPath);
    const scopeFiles = await this.resolveAuditScope(args.filePath, args.rootPath);
    const accumulator = new ResultAccumulator(scopeFiles);
    const fileContents = new Map<string, string>();
    const fileIds = scopeFiles.map((filePath) => upsertFile(projectId, filePath));

    clearApplicableGuidelinesForFiles(fileIds);
    clearAuditResultsForFiles(fileIds);

    const runtimeReport = await this.runScopedRuntimeAnalysis({
      rootPath: args.rootPath,
      projectUrl: args.projectUrl,
      scopeFiles,
    });

    for (const filePath of scopeFiles) {
      const fileId = getFileId(projectId, filePath);
      if (!fileId) {
        accumulator.markFileComplete(filePath);
        continue;
      }

      const content = await fs.readFile(filePath, "utf8");
      fileContents.set(filePath, content);
      updateFileStatus(fileId, "analyzing");

      this.seedApplicableGuidelines(filePath, fileId, runtimeReport, args.rootPath);

      const ignoredGuidelines = new Set(getIgnoredGuidelines(fileId));
      const guidelines = getApplicableGuidelines(fileId).filter(
        (guideline) =>
          !ignoredGuidelines.has(guideline.wcag_id) &&
          !isContrastGuideline(guideline.wcag_id)
      );

      if (guidelines.length === 0) {
        accumulator.markFileComplete(filePath);
        continue;
      }

      const threadId = `report-audit-${crypto.randomUUID()}`;
      this.llm.createThread(threadId, AUDIT_SYSTEM_PROMPT);
      await this.llm.send(
        threadId,
        buildFilePrimePrompt(
          path.basename(filePath),
          content,
          extractAuditableElementInventory(content)
        )
      );

      for (const guideline of guidelines) {
        try {
          const reply = await this.llm.send(
            threadId,
            buildGuidelineCheckPrompt(guideline.wcag_id, guideline.description),
            { json: true }
          );
          const parsed = JSON.parse(reply) as {
            status?: "passed" | "failed" | "na";
            issues?: Array<{
              issueDescription?: string;
              severity?: "error" | "warning" | "info";
              lineNumber?: number | null;
              selector?: string | null;
              snippet?: string | null;
              suggestion?: string | null;
            }>;
          };

          const status =
            parsed.status === "failed" || parsed.status === "na"
              ? parsed.status
              : "passed";

          const issues = status === "failed"
            ? dedupeGuidelineIssues(parsed.issues || []).map((issue) =>
                this.createCandidateIssue({
                  filePath,
                  guideline: guideline.wcag_id,
                  source: "llm",
                  severity: toSeverity(issue.severity),
                  issueDescription: issue.issueDescription || "WCAG violation detected",
                  lineNumber: issue.lineNumber ?? null,
                  selector: issue.selector ?? null,
                  snippet: sanitizeSnippet(issue.snippet),
                  suggestion: issue.suggestion ?? null,
                })
              )
            : [];

          accumulator.addFragment({
            fragmentKey: buildFragmentKey(filePath, guideline.wcag_id, "llm"),
            filePath,
            guideline: guideline.wcag_id,
            source: "llm",
            status,
            issues,
          });
        } catch (error) {
          accumulator.addFragment({
            fragmentKey: buildFragmentKey(filePath, guideline.wcag_id, "llm"),
            filePath,
            guideline: guideline.wcag_id,
            source: "llm",
            status: "na",
            issues: [],
          });
          console.error(
            `[ReportService] Failed guideline check ${guideline.wcag_id} for ${filePath}:`,
            error
          );
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

  private async runScopedRuntimeAnalysis(args: {
    rootPath: string;
    projectUrl?: string;
    scopeFiles: string[];
  }): Promise<WcagMapperReport | null> {
    const result = await this.tool.runWcagMapper({
      projectRoot: args.rootPath,
      url: args.projectUrl,
    });

    if (!result.success) {
      if (result.needsUrl) {
        throw new ReportServiceNeedsUrlError(
          "Runtime analysis requires the running project URL to generate a fresh report."
        );
      }

      throw new Error(result.error || "wcag_mapper failed");
    }

    const scopeSet = new Set(args.scopeFiles.map((filePath) => normalizePath(filePath)));
    return {
      ...result.report!,
      files: result.report!.files.filter((file) => {
        const fullPath = normalizePath(
          path.isAbsolute(file.path) ? file.path : path.join(args.rootPath, file.path)
        );
        return scopeSet.has(fullPath);
      }),
    };
  }

  private seedApplicableGuidelines(
    filePath: string,
    fileId: number,
    runtimeReport: WcagMapperReport | null,
    rootPath: string
  ): void {
    const runtimeFile = runtimeReport?.files.find((file) => {
      const fullPath = normalizePath(
        path.isAbsolute(file.path) ? file.path : path.join(rootPath, file.path)
      );
      return fullPath === normalizePath(filePath);
    });

    markFileRuntimeAnalyzed(fileId, Boolean(runtimeReport));

    if (runtimeFile) {
      for (const guideline of runtimeFile.guidelines) {
        if (isContrastGuideline(guideline.scId)) {
          continue;
        }

        upsertApplicableGuideline(
          fileId,
          guideline.scId,
          `${guideline.title} [${guideline.category}] (Level ${guideline.level})`
        );
      }
    }

    const existing = getApplicableGuidelines(fileId);
    if (existing.length > 0) {
      return;
    }

    const fallbackGuidelines = this.isStylesheetFile(filePath)
      ? STYLESHEET_FALLBACK_GUIDELINES
      : COMPONENT_FALLBACK_GUIDELINES;

    for (const guideline of fallbackGuidelines) {
      upsertApplicableGuideline(fileId, guideline.wcag_id, guideline.description);
    }
  }

  private addRuntimeFragments(
    accumulator: ResultAccumulator,
    runtimeReport: WcagMapperReport | null,
    rootPath: string,
    scopeFiles: string[]
  ): void {
    if (!runtimeReport) {
      return;
    }

    const contrastIssues = extractContrastFailures(runtimeReport).map((issue) => ({
      ...issue,
      filePath: normalizePath(
        path.isAbsolute(issue.filePath)
          ? issue.filePath
          : path.join(rootPath, issue.filePath)
      ),
    }));

    for (const filePath of scopeFiles) {
      const fileIssues = getContrastIssuesForFile(contrastIssues, filePath);
      if (fileIssues.length === 0) {
        continue;
      }

      const grouped = new Map<string, CandidateIssue[]>();
      for (const issue of fileIssues) {
        const fragmentKey = buildFragmentKey(filePath, issue.guideline, "runtime");
        const bucket = grouped.get(fragmentKey) || [];
        bucket.push(
          this.createCandidateIssue({
            filePath,
            guideline: issue.guideline,
            source: "runtime",
            severity: toSeverity(issue.severity),
            issueDescription: issue.issueDescription,
            lineNumber: null,
            selector: issue.selector ?? null,
            snippet: sanitizeSnippet(issue.snippet),
            suggestion: issue.suggestion || null,
          })
        );
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

  private async finalizeWithJudge(args: {
    targetFilePath: string;
    scopeFiles: string[];
    accumulator: ResultAccumulator;
    fileContents: Map<string, string>;
  }): Promise<FinalIssue[]> {
    const candidates = args.accumulator.getFailedCandidates();
    if (candidates.length === 0) {
      return [];
    }

    const filesForJudge: Array<{
      filePath: string;
      role: "target" | "dependency";
      content: string;
    }> = args.scopeFiles.map((filePath) => ({
      filePath,
      role: filePath === args.targetFilePath ? "target" : "dependency",
      content: clipLargeText(args.fileContents.get(filePath) || ""),
    }));

    const threadId = `report-judge-${crypto.randomUUID()}`;
    this.llm.createThread(threadId, REPORT_JUDGE_SYSTEM_PROMPT);

    try {
      const reply = await this.llm.send(
        threadId,
        buildReportJudgePrompt({
          targetFilePath: args.targetFilePath,
          dependencyPaths: args.scopeFiles.filter(
            (filePath) => filePath !== args.targetFilePath
          ),
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
        }),
        { json: true }
      );

      const parsed = JSON.parse(reply) as {
        confirmedIssues?: JudgeDecision[];
      };

      const confirmed = new Map(
        (parsed.confirmedIssues || []).map((item) => [item.candidateId, item.confidence])
      );

      return candidates
        .filter((candidate) => confirmed.has(candidate.candidateId))
        .map((candidate) => ({
          ...candidate,
          confidence: confirmed.get(candidate.candidateId) || "medium",
        }));
    } finally {
      this.llm.dropThread(threadId);
    }
  }

  private persistFinalReport(args: {
    projectId: number;
    targetFilePath: string;
    fileHash: string;
    scopeFiles: string[];
    accumulator: ResultAccumulator;
    finalIssues: FinalIssue[];
  }): StoredReportPayload {
    const issueIdsByFile = new Map<string, number[]>();

    for (const issue of args.finalIssues) {
      const fileId = getFileId(args.projectId, issue.filePath);
      if (!fileId) {
        continue;
      }

      const auditResultId = insertAuditResult(
        fileId,
        issue.issueDescription,
        issue.guideline,
        issue.severity,
        issue.lineNumber,
        issue.selector,
        issue.snippet,
        issue.suggestion,
        issue.source
      );

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
      const fileId = getFileId(args.projectId, filePath);
      if (!fileId) {
        continue;
      }

      const fileFragments = fragments.filter((fragment) => fragment.filePath === filePath);
      const totalChecks = fileFragments.length;
      const failingChecks = fileFragments.filter(
        (fragment) => fragment.status === "failed" && failingFragmentKeys.has(fragment.fragmentKey)
      ).length;
      const score = totalChecks === 0
        ? 100
        : Math.max(0, Math.round(((totalChecks - failingChecks) / totalChecks) * 100));

      updateFileStatus(fileId, "done", score);
    }

    const groupedIssues = buildGroupedIssues(finalResults);
    const fileEntries = buildFileEntries(groupedIssues);
    const counts = buildSeverityCounts(finalResults);
    const overallAccessibilityScore = computeOverallScore(fragments, failingFragmentKeys);

    return insertStoredReport({
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

  private async computeFileHash(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  private async resolveAuditScope(
    entryFilePath: string,
    rootPath: string
  ): Promise<string[]> {
    const resolvedRoot = normalizePath(rootPath);
    const visited = new Set<string>();
    const ordered: string[] = [];

    const visit = async (filePath: string): Promise<void> => {
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

      if (!SCRIPT_EXTENSIONS.has(extension) && !STYLESHEET_EXTENSIONS.has(extension)) {
        return;
      }

      let content = "";
      try {
        content = await fs.readFile(normalizedFilePath, "utf8");
      } catch {
        return;
      }

      const dependencies = extractLocalDependencySpecifiers(content, extension)
        .map((specifier) => resolveDependencySpecifier(normalizedFilePath, specifier))
        .filter((candidate): candidate is string => Boolean(candidate));

      for (const dependency of dependencies) {
        await visit(dependency);
      }
    };

    await visit(entryFilePath);
    return ordered;
  }

  private isStylesheetFile(filePath: string): boolean {
    return STYLESHEET_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  private createCandidateIssue(input: Omit<CandidateIssue, "candidateId" | "fragmentKey">): CandidateIssue {
    return {
      ...input,
      candidateId: `candidate-${this.nextCandidateId++}`,
      fragmentKey: buildFragmentKey(input.filePath, input.guideline, input.source),
    };
  }
}

function normalizePath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, "/");
}

function buildFragmentKey(
  filePath: string,
  guideline: string,
  source: "llm" | "runtime"
): string {
  return `${normalizePath(filePath)}|${guideline}|${source}`;
}

function toSeverity(value: string | undefined): "error" | "warning" | "info" {
  if (value === "error" || value === "info") {
    return value;
  }
  return "warning";
}

function sanitizeSnippet(value: string | null | undefined): string {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function clipLargeText(value: string, maxLength: number = 12000): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n/* truncated for judge context */`;
}

function extractLocalDependencySpecifiers(content: string, extension: string): string[] {
  const matches = new Set<string>();

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

  if (STYLESHEET_EXTENSIONS.has(extension)) {
    for (const match of content.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (specifier?.startsWith(".")) {
        matches.add(specifier);
      }
    }
  }

  return [...matches];
}

function resolveDependencySpecifier(importerPath: string, specifier: string): string | null {
  const importerDir = path.dirname(importerPath);
  const cleanedSpecifier = specifier.replace(/[?#].*$/, "");
  const hasExplicitExtension = path.extname(cleanedSpecifier).length > 0;
  const basePath = normalizePath(path.resolve(importerDir, cleanedSpecifier));

  const candidates = hasExplicitExtension
    ? [basePath]
    : [
        ...[...AUDITABLE_EXTENSIONS].map((extension) => `${basePath}${extension}`),
        ...[...AUDITABLE_EXTENSIONS].map((extension) =>
          normalizePath(path.join(basePath, `index${extension}`))
        ),
      ];

  for (const candidate of candidates) {
    try {
      const stat = require("fs").statSync(candidate) as { isFile(): boolean };
      if (stat.isFile()) {
        return normalizePath(candidate);
      }
    } catch {
      // ignore missing candidates
    }
  }

  return null;
}

function buildGroupedIssues(results: StoredReportPayload["results"]): StoredReportPayload["groupedIssues"] {
  const groups = new Map<string, StoredReportPayload["groupedIssues"][number]>();

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

function buildGroupLabel(issue: StoredReportPayload["results"][number]): string {
  if (issue.selector) {
    return issue.selector;
  }

  if (issue.lineNumber !== undefined) {
    return `Line ${issue.lineNumber}`;
  }

  return issue.guideline;
}

function buildFileEntries(
  groupedIssues: StoredReportPayload["groupedIssues"]
): StoredReportPayload["fileEntries"] {
  const counts = new Map<string, number>();

  for (const group of groupedIssues) {
    const visibleIssues = group.issues.filter((issue) => !issue.ignored).length;
    counts.set(group.filePath, (counts.get(group.filePath) || 0) + visibleIssues);
  }

  return [...counts.entries()].map(([filePath, issueCount]) => ({
    filePath,
    issueCount,
  }));
}

function buildSeverityCounts(
  results: StoredReportPayload["results"]
): StoredReportPayload["counts"] {
  return results.reduce(
    (acc, issue) => {
      if (!issue.ignored) {
        const severity: keyof StoredReportPayload["counts"] =
          issue.severity === "error" ||
          issue.severity === "warning" ||
          issue.severity === "info"
            ? issue.severity
            : "warning";
        acc[severity] += 1;
      }
      return acc;
    },
    { error: 0, warning: 0, info: 0 }
  );
}

function computeOverallScore(
  fragments: AuditFragment[],
  failingFragmentKeys: Set<string>
): number {
  if (fragments.length === 0) {
    return 100;
  }

  const failedChecks = fragments.filter(
    (fragment) => fragment.status === "failed" && failingFragmentKeys.has(fragment.fragmentKey)
  ).length;
  return Math.max(
    0,
    Math.round(((fragments.length - failedChecks) / fragments.length) * 100)
  );
}