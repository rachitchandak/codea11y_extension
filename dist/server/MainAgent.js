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
exports.MainAgent = void 0;
const events_1 = require("events");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const db_1 = require("./db");
const ContrastProcessor_1 = require("./ContrastProcessor");
const STYLESHEET_EXTENSIONS = new Set([".css", ".scss", ".sass", ".less"]);
const STYLESHEET_FALLBACK_GUIDELINES = [
    {
        wcag_id: "1.4.1",
        description: "Use of Color: styling must not rely on color alone to communicate status, meaning, or required actions.",
    },
    {
        wcag_id: "2.4.7",
        description: "Focus Visible: styling must preserve a clear visible focus indicator and must not remove outlines without an adequate replacement.",
    },
    {
        wcag_id: "1.4.13",
        description: "Content on Hover or Focus: hover or focus triggered content styled here must remain dismissible, hoverable, and persistent when required.",
    },
    {
        wcag_id: "2.4.11",
        description: "Focus Not Obscured (Minimum): sticky, overlay, or positioned styling must not obscure focused controls.",
    },
];
/* ------------------------------------------------------------------ *
 *  MainAgent                                                          *
 *  Orchestrates: Intent → Runtime → Audit → Validate                  *
 *                                                                     *
 *  Emits "event" with AgentEvent payloads that the server streams     *
 *  back to the extension as NDJSON.                                   *
 * ------------------------------------------------------------------ */
class MainAgent extends events_1.EventEmitter {
    constructor(llm, tool) {
        super();
        this.llm = llm;
        this.tool = tool;
        this.state = "idle";
        this.todoList = [];
        this.projectId = 0;
        this.needsRuntime = false;
        this.contrastIssues = [];
        this.pendingRuntimeResults = [];
    }
    get currentState() {
        return this.state;
    }
    /* ── Helper: push an event to the consumer ─────────────────────── */
    push(event, data) {
        this.emit("event", { event, data });
    }
    normalizeFilePath(filePath) {
        return path.resolve(filePath).replace(/\\/g, "/").toLowerCase();
    }
    isTargetFile(candidatePath) {
        const normalizedCandidate = this.normalizeFilePath(candidatePath);
        return this.todoList.some((todo) => this.normalizeFilePath(todo.file) === normalizedCandidate);
    }
    isStylesheetFile(filePath) {
        return STYLESHEET_EXTENSIONS.has(path.extname(filePath).toLowerCase());
    }
    getGuidelinesForAudit(fileId, filePath) {
        const existing = (0, db_1.getFileGuidelines)(fileId);
        const guidelineMap = new Map(existing.map((guideline) => [guideline.wcag_id, guideline]));
        if (this.isStylesheetFile(filePath)) {
            for (const guideline of STYLESHEET_FALLBACK_GUIDELINES) {
                if (!guidelineMap.has(guideline.wcag_id)) {
                    (0, db_1.upsertGuideline)(fileId, guideline.wcag_id, guideline.description, "active");
                    guidelineMap.set(guideline.wcag_id, {
                        ...guideline,
                        status: "active",
                    });
                }
            }
        }
        return [...guidelineMap.values()]
            .filter((guideline) => guideline.status !== "ignored" &&
            guideline.status !== "na" &&
            !(0, ContrastProcessor_1.isContrastGuideline)(guideline.wcag_id))
            .map(({ wcag_id, description }) => ({ wcag_id, description }));
    }
    dedupeGuidelineIssues(issues) {
        const deduped = new Map();
        for (const issue of issues || []) {
            const normalized = {
                issueDescription: this.normalizeIssueText(issue.issueDescription),
                severity: this.normalizeSeverity(issue.severity),
                lineNumber: issue.lineNumber ?? null,
                selector: this.nullableIssueText(issue.selector),
                snippet: this.nullableIssueText(issue.snippet),
                suggestion: this.nullableIssueText(issue.suggestion),
            };
            const dedupeKey = this.buildIssueDedupeKey(normalized);
            const existing = deduped.get(dedupeKey);
            if (!existing) {
                deduped.set(dedupeKey, normalized);
                continue;
            }
            const preferIncoming = this.severityRank(normalized.severity) >
                this.severityRank(existing.severity);
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
    buildIssueDedupeKey(issue) {
        const hasLocation = issue.lineNumber !== null || Boolean(issue.selector);
        if (hasLocation) {
            return [issue.lineNumber ?? "", issue.selector || ""].join("|");
        }
        return [issue.snippet || "", issue.issueDescription].join("|");
    }
    severityRank(severity) {
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
    normalizeSeverity(severity) {
        const normalized = String(severity || "warning").toLowerCase();
        if (normalized === "error" || normalized === "warning" || normalized === "info") {
            return normalized;
        }
        return "warning";
    }
    normalizeIssueText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }
    nullableIssueText(value) {
        const normalized = this.normalizeIssueText(value);
        return normalized || null;
    }
    loadPersistedRuntimeResults() {
        this.contrastIssues = [];
        this.pendingRuntimeResults = [];
        for (const todo of this.todoList) {
            const fileId = (0, db_1.getFileId)(this.projectId, todo.file);
            if (!fileId) {
                continue;
            }
            const runtimeResults = (0, db_1.getAuditResultsBySource)(fileId, "runtime");
            for (const result of runtimeResults) {
                const guideline = result.guideline || "1.4.3";
                this.contrastIssues.push({
                    filePath: todo.file,
                    foreground: "",
                    background: "",
                    contrastRatio: 0,
                    requiredRatio: 0,
                    isLargeText: false,
                    guideline,
                    severity: result.severity,
                    issueDescription: result.issue_description,
                    selector: result.selector,
                    snippet: result.snippet,
                    suggestion: result.suggestion || "",
                });
                this.pendingRuntimeResults.push({
                    id: String(result.id),
                    filePath: todo.file,
                    guideline,
                    severity: result.severity,
                    issueDescription: result.issue_description,
                    lineNumber: null,
                    selector: result.selector,
                    snippet: result.snippet || "",
                    suggestion: result.suggestion || "",
                    ignored: result.ignored === 1,
                    source: "runtime",
                });
            }
        }
    }
    /* ================================================================ *
     *  Main orchestration                                               *
     * ================================================================ */
    async run(params) {
        try {
            // Phase 1 ─ Intent & TODO Generation
            this.state = "intent";
            this.push("AGENT_MESSAGE", {
                content: "Analyzing your project and generating audit plan…",
            });
            await this.phaseIntent(params);
            // Phase 2 ─ Runtime Integration (wcag_mapper)
            this.state = "runtime";
            await this.phaseRuntime(params);
            // Phase 3 ─ Granular Audit Loop
            this.state = "audit";
            await this.phaseAudit(params);
            // Phase 4 ─ Final Validation (LLM-as-a-Judge)
            this.state = "validate";
            await this.phaseValidate(params);
            // Done
            this.state = "done";
            this.push("AGENT_MESSAGE", {
                content: "Audit complete! Check the Report panel for full results.",
            });
            this.push("DONE", { summary: "Audit workflow complete." });
        }
        catch (err) {
            this.state = "error";
            this.push("ERROR", { message: err.message });
        }
    }
    /* ================================================================ *
     *  Phase 1 – Intent & TODO Generation                               *
     * ================================================================ */
    async phaseIntent(params) {
        const { userQuery, fileTree, rootPath } = params;
        const projectName = path.basename(rootPath);
        this.projectId = (0, db_1.upsertProject)(projectName, rootPath);
        // Ask the LLM to pick target files and explain why
        const threadId = "intent";
        this.llm.createThread(threadId, `You are an expert accessibility auditor. Given a user query and a project file tree, determine which specific files need accessibility auditing.

Return a JSON object with exactly this shape:
{
  "targetFiles": [
    { "file": "relative/path/to/file.tsx", "reason": "Brief explanation of why this file needs auditing" }
  ],
  "reasoning": "Brief overall explanation of your file selection strategy"
}

Rules:
- Only include files that actually exist in the provided file tree.
- Use the relative paths as shown in the file tree.
- Focus on UI files: HTML, JSX, TSX, Vue, Svelte, CSS, etc.
- Prioritize files with interactive elements, forms, navigation, images, and dynamic content.
- Consider the user's query to narrow focus if they specify particular concerns.`);
        const reply = await this.llm.send(threadId, `User Query: ${userQuery}\n\nProject File Tree:\n${JSON.stringify(fileTree, null, 2)}`, { json: true });
        this.llm.dropThread(threadId);
        const parsed = JSON.parse(reply);
        const targets = parsed.targetFiles || [];
        // Register files, check for existing guidelines
        this.needsRuntime = params.forceRuntime || false;
        this.todoList = targets.map(({ file, reason }) => {
            const fullPath = path.isAbsolute(file)
                ? file
                : path.join(rootPath, file);
            const fileId = (0, db_1.upsertFile)(this.projectId, fullPath);
            const hasRuntimeAnalysis = (0, db_1.hasFileRuntimeAnalysis)(fileId);
            if (!hasRuntimeAnalysis) {
                this.needsRuntime = true;
            }
            return { file: fullPath, status: "pending", reason };
        });
        this.push("SYNC_TODO", { todos: this.todoList });
        this.push("AGENT_MESSAGE", {
            content: `Identified ${this.todoList.length} file(s) to audit. ${this.needsRuntime
                ? "Runtime analysis needed — will run wcag_mapper."
                : "Runtime analysis already available from a previous run."}\n\n${parsed.reasoning || ""}`,
        });
    }
    /* ================================================================ *
     *  Phase 2 – Runtime Integration (wcag_mapper)                      *
     * ================================================================ */
    async phaseRuntime(params) {
        if (!this.needsRuntime) {
            this.loadPersistedRuntimeResults();
            this.push("AGENT_MESSAGE", {
                content: this.pendingRuntimeResults.length > 0
                    ? `Skipping runtime analysis — reusing ${this.pendingRuntimeResults.length} cached runtime-verified contrast issue(s).`
                    : "Skipping runtime analysis — guidelines already mapped.",
            });
            return;
        }
        this.push("AGENT_MESSAGE", {
            content: "Running runtime analysis with wcag_mapper…",
        });
        this.push("SET_PROGRESS", {
            percent: 5,
            label: "Starting runtime analysis…",
        });
        const result = await this.tool.runWcagMapper({
            projectRoot: params.rootPath,
            url: params.projectUrl,
        });
        if (!result.success) {
            if (result.needsUrl) {
                this.push("NEED_URL", {
                    message: "I need to run runtime analysis. Please provide the URL where your project is currently running.",
                });
                throw new Error("Runtime analysis requires a project URL. Please restart the audit with the running project URL.");
            }
            throw new Error(`wcag_mapper failed: ${result.error}`);
        }
        (0, db_1.clearProjectRuntimeAnalysis)(this.projectId);
        this.contrastIssues = [];
        this.pendingRuntimeResults = [];
        for (const todo of this.todoList) {
            const fileId = (0, db_1.upsertFile)(this.projectId, todo.file);
            (0, db_1.markFileRuntimeAnalyzed)(fileId, true);
        }
        // Persist only the runtime data that belongs to the files selected for this audit.
        const report = result.report;
        const scopedFiles = report.files.filter((file) => {
            const fullPath = path.isAbsolute(file.path)
                ? file.path
                : path.join(params.rootPath, file.path);
            return this.isTargetFile(fullPath);
        });
        const scopedUniqueGuidelines = new Set();
        let scopedContrastFailures = 0;
        for (const file of scopedFiles) {
            for (const guideline of file.guidelines) {
                scopedUniqueGuidelines.add(guideline.scId);
            }
            scopedContrastFailures += (file.contrastFindings || []).filter((finding) => !finding.passes).length;
        }
        const scopedReport = {
            ...report,
            files: scopedFiles,
            summary: {
                files: scopedFiles.length,
                uniqueGuidelines: scopedUniqueGuidelines.size,
                contrastFailures: scopedContrastFailures,
            },
        };
        for (const file of scopedReport.files) {
            const fullPath = path.isAbsolute(file.path)
                ? file.path
                : path.join(params.rootPath, file.path);
            const fileId = (0, db_1.upsertFile)(this.projectId, fullPath);
            (0, db_1.markFileRuntimeAnalyzed)(fileId, true);
            for (const g of file.guidelines) {
                if ((0, ContrastProcessor_1.isContrastGuideline)(g.scId)) {
                    continue;
                }
                (0, db_1.upsertGuideline)(fileId, g.scId, `${g.title} [${g.category}] (Level ${g.level})`);
            }
        }
        this.push("SET_PROGRESS", {
            percent: 20,
            label: "Runtime analysis complete",
        });
        // ── Extract and persist contrast failures as Verified Failures ──
        this.contrastIssues = (0, ContrastProcessor_1.extractContrastFailures)(scopedReport);
        for (const ci of this.contrastIssues) {
            const fullPath = path.isAbsolute(ci.filePath)
                ? ci.filePath
                : path.join(params.rootPath, ci.filePath);
            const fileId = (0, db_1.upsertFile)(this.projectId, fullPath);
            // Mark the contrast guideline as failed (Source: Runtime)
            (0, db_1.upsertGuideline)(fileId, ci.guideline, `Contrast failure verified by runtime engine [${ci.guideline}]`, "failed");
            const resultId = (0, db_1.insertAuditResult)(fileId, ci.issueDescription, ci.guideline, ci.severity, null, ci.selector, ci.snippet, ci.suggestion, "runtime");
            this.pendingRuntimeResults.push({
                id: String(resultId),
                filePath: fullPath,
                guideline: ci.guideline,
                severity: ci.severity,
                issueDescription: ci.issueDescription,
                lineNumber: null,
                selector: ci.selector,
                snippet: ci.snippet || "",
                suggestion: ci.suggestion,
                ignored: false,
                source: "runtime",
            });
        }
        this.push("AGENT_MESSAGE", {
            content: `Runtime analysis complete — mapped **${scopedReport.summary.uniqueGuidelines}** guidelines across **${scopedReport.summary.files}** files (${scopedReport.summary.contrastFailures} contrast failures detected${this.contrastIssues.length > 0 ? " and stored as verified failures" : ""}).`,
        });
    }
    /* ================================================================ *
     *  Phase 3 – Granular Audit Loop (sequential, cached)               *
     *                                                                   *
     *  For each file:                                                   *
     *    1. Prime LLM thread with the full file content.                *
     *    2. For each applicable guideline, send a check request on the  *
     *       same thread so the LLM can leverage cached context.         *
     *    3. Persist every check result.                                 *
     * ================================================================ */
    async phaseAudit(params) {
        const total = this.todoList.length;
        let processed = 0;
        for (let i = 0; i < total; i++) {
            const todo = this.todoList[i];
            const fileId = (0, db_1.getFileId)(this.projectId, todo.file);
            if (!fileId) {
                todo.status = "skipped";
                todo.reason = "File not registered in database";
                this.push("SYNC_TODO", { todos: [...this.todoList] });
                continue;
            }
            // Pre-check: if no guidelines are mapped, skip the file
            const guidelines = this.getGuidelinesForAudit(fileId, todo.file);
            if (guidelines.length === 0) {
                todo.status = "skipped";
                todo.reason = this.isStylesheetFile(todo.file)
                    ? "No applicable non-contrast stylesheet checks remain"
                    : "Only runtime-managed contrast checks apply";
                this.push("SYNC_TODO", { todos: [...this.todoList] });
                continue;
            }
            // Mark as scanning
            todo.status = "scanning";
            this.push("SYNC_TODO", { todos: [...this.todoList] });
            (0, db_1.updateFileStatus)(fileId, "analyzing");
            this.push("AGENT_MESSAGE", {
                content: `Auditing **${path.basename(todo.file)}** — ${guidelines.length} guideline(s) to check…`,
            });
            // Read file content
            let content;
            try {
                content = fs.readFileSync(todo.file, "utf-8");
            }
            catch {
                todo.status = "error";
                todo.reason = "Cannot read file";
                (0, db_1.updateFileStatus)(fileId, "error");
                this.push("SYNC_TODO", { todos: [...this.todoList] });
                continue;
            }
            const basename = path.basename(todo.file);
            const threadId = `audit-${i}`;
            // ── Create thread, prime with file context ────────────────────
            this.llm.createThread(threadId, `You are an expert WCAG 2.1 accessibility auditor. You will analyze source code for accessibility issues.

IMPORTANT: Ignore any issues related to color contrast ratios (WCAG 1.4.3, 1.4.6, 1.4.11). Color contrast checks are handled by a separate deterministic engine and should NOT be evaluated by you.

Workflow:
1. You will first receive the full source code of a file to establish context.
2. Then you will be asked to check specific WCAG guidelines one at a time.

For each guideline check, respond with a JSON object:
{
  "status": "passed" | "failed" | "na",
  "issues": [
    {
      "issueDescription": "Clear description of the accessibility problem",
      "severity": "error" | "warning" | "info",
      "lineNumber": 42,
      "selector": "CSS selector or component identifier",
      "snippet": "Relevant code snippet (max 3 lines)",
      "suggestion": "Specific fix recommendation"
    }
  ]
}

Rules:
- "passed": All checks for this guideline pass. issues must be empty.
- "failed": At least one check fails. List every failing issue.
- "na": This guideline is not applicable to this file. issues must be empty.
- Be precise with line numbers and selectors.
- Only report genuine issues, not theoretical concerns.
- Do NOT report any contrast-related findings.`);
            // Prime the thread with the file content
            await this.llm.send(threadId, `Here is the source code of "${basename}" for analysis:\n\n\`\`\`\n${content}\n\`\`\`\n\nI will now ask you to check specific WCAG guidelines against this code one at a time. Acknowledge that you have cached this code context.`);
            // ── Sequential guideline checks on the same thread ────────────
            const ignoredIds = new Set((0, db_1.getIgnoredGuidelines)(fileId));
            let passCount = 0;
            let failCount = 0;
            let naCount = 0;
            for (const guideline of guidelines) {
                if (ignoredIds.has(guideline.wcag_id))
                    continue;
                const checkPrompt = `Check WCAG Guideline: **${guideline.wcag_id}** — ${guideline.description}

Evaluate the code you already have against this specific success criterion. Consider all relevant checks.
Respond with the JSON format specified in your instructions.`;
                try {
                    const reply = await this.llm.send(threadId, checkPrompt, {
                        json: true,
                    });
                    const result = JSON.parse(reply);
                    if (result.status === "na") {
                        naCount++;
                    }
                    else if (result.status === "passed") {
                        (0, db_1.upsertGuideline)(fileId, guideline.wcag_id, guideline.description, "passed");
                        passCount++;
                    }
                    else {
                        // failed
                        (0, db_1.upsertGuideline)(fileId, guideline.wcag_id, guideline.description, "failed");
                        failCount++;
                        const dedupedIssues = this.dedupeGuidelineIssues(result.issues || []);
                        for (const issue of dedupedIssues) {
                            const resultId = (0, db_1.insertAuditResult)(fileId, issue.issueDescription || "", guideline.wcag_id, issue.severity || "warning", issue.lineNumber ?? null, issue.selector ?? null, issue.snippet ?? null, issue.suggestion ?? null);
                            this.push("NEW_AUDIT_RESULT", {
                                id: String(resultId),
                                filePath: todo.file,
                                guideline: guideline.wcag_id,
                                severity: issue.severity || "warning",
                                issueDescription: issue.issueDescription || "",
                                lineNumber: issue.lineNumber ?? null,
                                selector: issue.selector ?? null,
                                snippet: issue.snippet || "",
                                suggestion: issue.suggestion ?? null,
                                ignored: false,
                            });
                        }
                    }
                }
                catch (err) {
                    console.error(`[MainAgent] Guideline check error (${guideline.wcag_id}):`, err.message);
                }
            }
            // Clean up the thread
            this.llm.dropThread(threadId);
            // Score & mark file
            const total_checks = passCount + failCount + naCount;
            const score = total_checks > 0
                ? Math.round(((passCount + naCount) / total_checks) * 100)
                : 100;
            (0, db_1.updateFileStatus)(fileId, "done", score);
            todo.status = "done";
            todo.reason = `Passed: ${passCount}, Failed: ${failCount}, N/A: ${naCount}`;
            this.push("SYNC_TODO", { todos: [...this.todoList] });
            processed++;
            const pct = 20 + Math.round((processed / total) * 55); // 20–75%
            this.push("SET_PROGRESS", {
                percent: pct,
                label: `Audited ${processed}/${total} files`,
            });
        }
        if (this.pendingRuntimeResults.length > 0) {
            this.push("AGENT_MESSAGE", {
                content: `Publishing ${this.pendingRuntimeResults.length} runtime-verified contrast issue(s) before validation…`,
            });
            for (const result of this.pendingRuntimeResults) {
                this.push("NEW_AUDIT_RESULT", result);
            }
            this.pendingRuntimeResults = [];
        }
    }
    /* ================================================================ *
     *  Phase 4 – Final Validation (LLM-as-a-Judge)                     *
     *                                                                   *
     *  For each file that had failures, send a consolidation prompt     *
     *  asking the LLM to validate findings and flag false positives.    *
     * ================================================================ */
    async phaseValidate(params) {
        this.push("AGENT_MESSAGE", {
            content: "Running final validation (LLM-as-a-Judge)…",
        });
        this.push("SET_PROGRESS", { percent: 75, label: "Validating findings…" });
        const filesWithFailures = this.todoList.filter((t) => t.status === "done");
        let validated = 0;
        for (const todo of filesWithFailures) {
            const fileId = (0, db_1.getFileId)(this.projectId, todo.file);
            if (!fileId) {
                validated++;
                continue;
            }
            const failed = (0, db_1.getFailedGuidelines)(fileId).filter((g) => !(0, ContrastProcessor_1.isContrastGuideline)(g.wcag_id));
            const fileContrastIssues = (0, ContrastProcessor_1.getContrastIssuesForFile)(this.contrastIssues, todo.file);
            if (failed.length === 0 && fileContrastIssues.length === 0) {
                validated++;
                continue;
            }
            // Read file for context
            let content;
            try {
                content = fs.readFileSync(todo.file, "utf-8");
            }
            catch {
                validated++;
                continue;
            }
            const basename = path.basename(todo.file);
            const threadId = `validate-${validated}`;
            this.llm.createThread(threadId, `You are a senior accessibility expert acting as a validation judge. Your role is to review accessibility audit findings and assess their accuracy.

You must:
1. Identify false positives — findings that are not actual WCAG violations.
2. Provide a confidence assessment for each validated finding.
3. Runtime-generated contrast findings are included alongside LLM findings. Do NOT recompute color ratios, but you may reject a runtime finding if the reported selector/snippet is clearly misattributed to this source file.
4. Do NOT add new issues or suggest missed guidelines. Your only job is to validate or reject the findings already reported.

Respond with a JSON object:
{
  "falsePositives": [
    { "wcagId": "1.1.1", "reason": "Why this is not actually a violation" }
  ],
  "validated": [
    { "wcagId": "1.3.1", "confidence": "high" | "medium" | "low" }
  ]
}`);
            const failureList = failed
                .map((g) => `- ${g.wcag_id}: ${g.description}`)
                .join("\n");
            const runtimeFailureList = fileContrastIssues
                .map((issue) => `- ${issue.guideline}: ${issue.issueDescription}${issue.selector ? ` [selector: ${issue.selector}]` : ""}${issue.snippet ? ` [snippet: ${issue.snippet}]` : ""} [source: runtime]`)
                .join("\n");
            const combinedFailureList = [failureList, runtimeFailureList]
                .filter(Boolean)
                .join("\n");
            const prompt = `Based on the following source code of "${basename}":

\`\`\`
${content}
\`\`\`

Here are the detected accessibility failures:
${combinedFailureList}
Validate these findings: identify if any are false positives. Do not add new issues or suggest missed guidelines. For runtime contrast findings, do not recompute color ratios; only judge whether the reported finding appears correctly attributed to this file and code context.`;
            try {
                const reply = await this.llm.send(threadId, prompt, { json: true });
                const validation = JSON.parse(reply);
                // Promote false positives back to "passed" (never override runtime contrast results)
                for (const fp of validation.falsePositives || []) {
                    if ((0, ContrastProcessor_1.isContrastGuideline)(fp.wcagId))
                        continue;
                    (0, db_1.upsertGuideline)(fileId, fp.wcagId, fp.reason || "False positive (LLM-as-Judge)", "passed");
                }
                this.push("VALIDATION_RESULT", {
                    filePath: todo.file,
                    falsePositives: validation.falsePositives || [],
                    validated: validation.validated || [],
                });
            }
            catch (err) {
                console.error(`[MainAgent] Validation error for ${basename}:`, err.message);
            }
            this.llm.dropThread(threadId);
            validated++;
            const pct = 75 +
                Math.round((validated / Math.max(filesWithFailures.length, 1)) * 25);
            this.push("SET_PROGRESS", {
                percent: Math.min(pct, 100),
                label: `Validated ${validated}/${filesWithFailures.length} files`,
            });
        }
    }
}
exports.MainAgent = MainAgent;
//# sourceMappingURL=MainAgent.js.map