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
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const db_1 = require("./db");
const ContrastProcessor_1 = require("./ContrastProcessor");
const agentConstants_1 = require("./agentConstants");
const issueHelpers_1 = require("./issueHelpers");
const sourceInventory_1 = require("./sourceInventory");
const prompts_1 = require("./prompts");
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
    hashFileContent(content) {
        return crypto.createHash("sha256").update(content, "utf8").digest("hex");
    }
    /* ── Helper: push an event to the consumer ─────────────────────── */
    push(event, data) {
        this.emit("event", { event, data });
    }
    pushWorkflowState(args) {
        this.push("WORKFLOW_CONTEXT", args);
    }
    pushWorkflowTodos(todos) {
        this.push("WORKFLOW_TODOS", { todos });
    }
    pushPhaseStatus(phase, status, detail, counts) {
        this.push("PHASE_STATUS", {
            phase,
            status,
            detail,
            completed: counts?.completed,
            total: counts?.total,
        });
    }
    pushIntentSummary(totalFiles, runtimeMode) {
        this.push("INTENT_SUMMARY", {
            totalFiles,
            runtimeMode,
        });
    }
    pushRuntimeUpdate(status, summary, details, countLabel) {
        this.push("RUNTIME_UPDATE", {
            status,
            summary,
            details,
            countLabel,
        });
    }
    pushAuditFileStart(filePath, fileIndex, fileTotal, guidelineTotal) {
        this.push("AUDIT_FILE_START", {
            filePath,
            fileIndex,
            fileTotal,
            guidelineTotal,
        });
    }
    pushAuditGuidelineProgress(payload) {
        this.push("AUDIT_GUIDELINE_PROGRESS", payload);
    }
    pushAuditFileComplete(payload) {
        this.push("AUDIT_FILE_COMPLETE", payload);
    }
    pushValidationUpdate(status, summary, counts, filePath) {
        this.push("VALIDATION_UPDATE", {
            status,
            summary,
            completed: counts?.completed,
            total: counts?.total,
            filePath,
        });
    }
    buildWorkflowTodos(rawTodos) {
        const defaults = {
            runtime: "Run runtime analysis",
            audit: "Audit selected files",
            validate: "Review findings",
        };
        const expectedIds = ["runtime", "audit", "validate"];
        const items = new Map();
        if (Array.isArray(rawTodos)) {
            for (const todo of rawTodos) {
                if (!todo || typeof todo !== "object")
                    continue;
                const id = typeof todo.id === "string"
                    ? todo.id.trim()
                    : "";
                if (!expectedIds.includes(id)) {
                    continue;
                }
                const title = typeof todo.title === "string"
                    ? todo.title.trim()
                    : "";
                const detail = typeof todo.detail === "string"
                    ? todo.detail.trim()
                    : "";
                items.set(id, {
                    title: title || undefined,
                    detail: detail || undefined,
                });
            }
        }
        return expectedIds.map((id) => ({
            id,
            title: items.get(id)?.title || defaults[id],
            status: "pending",
            detail: items.get(id)?.detail,
        }));
    }
    normalizeFilePath(filePath) {
        return path.resolve(filePath).replace(/\\/g, "/").toLowerCase();
    }
    isTargetFile(candidatePath) {
        const normalizedCandidate = this.normalizeFilePath(candidatePath);
        return this.todoList.some((todo) => this.normalizeFilePath(todo.file) === normalizedCandidate);
    }
    isStylesheetFile(filePath) {
        return agentConstants_1.STYLESHEET_EXTENSIONS.has(path.extname(filePath).toLowerCase());
    }
    getGuidelinesForAudit(fileId, filePath) {
        const existing = (0, db_1.getApplicableGuidelines)(fileId);
        const guidelineMap = new Map(existing.map((guideline) => [guideline.wcag_id, guideline]));
        return [...guidelineMap.values()]
            .filter((guideline) => !(0, ContrastProcessor_1.isContrastGuideline)(guideline.wcag_id))
            .map(({ wcag_id, description }) => ({ wcag_id, description }));
    }
    loadPersistedRuntimeResults() {
        this.contrastIssues = [];
        this.pendingRuntimeResults = [];
        for (const todo of this.todoList) {
            const fileId = (0, db_1.getFileId)(this.projectId, todo.file);
            if (!fileId)
                continue;
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
            this.state = "intent";
            this.llm.setPhase("intent");
            const shouldAudit = await this.phaseIntent(params);
            if (!shouldAudit) {
                this.state = "done";
                return;
            }
            this.state = "runtime";
            this.llm.setPhase("runtime");
            await this.phaseRuntime(params);
            this.state = "audit";
            this.llm.setPhase("audit");
            await this.phaseAudit(params);
            this.state = "validate";
            this.llm.setPhase("validate");
            await this.phaseValidate(params);
            this.state = "done";
            this.pushWorkflowState({
                kind: "audit",
                title: "Accessibility audit",
                summary: "Audit workflow complete.",
                status: "done",
                scopeLabel: `${this.todoList.length} file${this.todoList.length === 1 ? "" : "s"}`,
            });
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
        const threadId = "intent";
        this.llm.createThread(threadId, prompts_1.INTENT_SYSTEM_PROMPT);
        const reply = await this.llm.send(threadId, `User Query: ${userQuery}\n\nProject File Tree:\n${JSON.stringify(fileTree, null, 2)}`, { json: true });
        this.llm.dropThread(threadId);
        const parsed = JSON.parse(reply);
        const intent = parsed.intent === "audit" ? "audit" : "no_audit";
        const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning.trim() : "";
        const responseMessage = typeof parsed.responseMessage === "string" ? parsed.responseMessage.trim() : "";
        if (intent !== "audit") {
            this.todoList = [];
            this.needsRuntime = false;
            this.pushWorkflowTodos([]);
            this.pushWorkflowState({
                kind: "audit",
                title: "Accessibility audit",
                summary: "No audit started.",
                status: "skipped",
                scopeLabel: path.basename(rootPath),
                detail: reasoning ||
                    "The request did not clearly ask for an accessibility audit.",
            });
            this.push("AGENT_MESSAGE", {
                content: responseMessage ||
                    "I did not start an accessibility audit because the request was not an audit instruction. Ask me to audit a file or use /reports to open saved reports.",
            });
            return false;
        }
        const targets = Array.isArray(parsed.targetFiles)
            ? parsed.targetFiles.filter((target) => Boolean(target &&
                typeof target === "object" &&
                typeof target.file === "string"))
            : [];
        if (targets.length === 0) {
            this.todoList = [];
            this.needsRuntime = false;
            this.pushWorkflowTodos([]);
            this.pushWorkflowState({
                kind: "audit",
                title: "Accessibility audit",
                summary: "No auditable files were selected.",
                status: "skipped",
                scopeLabel: path.basename(rootPath),
                detail: reasoning ||
                    "The request looked like an audit, but no matching auditable files were identified.",
            });
            this.push("AGENT_MESSAGE", {
                content: responseMessage ||
                    "I could not identify any matching auditable files for that request. Name a file, component, folder, or explicitly ask for a whole-project audit.",
            });
            return false;
        }
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
        const workflowTodos = this.buildWorkflowTodos(parsed.workflowTodos).map((todo) => {
            if (todo.id !== "audit") {
                return todo;
            }
            return {
                ...todo,
                detail: todo.detail ||
                    `Audit ${this.todoList.length} selected file${this.todoList.length === 1 ? "" : "s"}.`,
            };
        });
        this.pushWorkflowTodos(workflowTodos);
        this.push("SYNC_TODO", { todos: this.todoList });
        this.pushWorkflowState({
            kind: "audit",
            title: "Accessibility audit",
            summary: `Planning an audit across ${this.todoList.length} selected file${this.todoList.length === 1 ? "" : "s"}.`,
            status: "analyzing",
            scopeLabel: path.basename(rootPath),
            detail: reasoning ||
                (this.needsRuntime
                    ? "Runtime analysis will run because required data is not cached yet."
                    : "Runtime analysis will be skipped because cached data is already available."),
        });
        this.pushPhaseStatus("runtime", this.needsRuntime ? "pending" : "done", this.needsRuntime
            ? "Runtime analysis queued"
            : "Using cached runtime analysis");
        this.pushPhaseStatus("audit", "pending", "Waiting to start file audit", {
            completed: 0,
            total: this.todoList.length,
        });
        this.pushPhaseStatus("validate", "pending", "Waiting for audited findings", {
            completed: 0,
            total: 0,
        });
        this.pushIntentSummary(this.todoList.length, this.needsRuntime ? "required" : "cached");
        return true;
    }
    /* ================================================================ *
     *  Phase 2 – Runtime Integration (wcag_mapper)                      *
     * ================================================================ */
    async phaseRuntime(params) {
        if (!this.needsRuntime) {
            this.loadPersistedRuntimeResults();
            this.pushPhaseStatus("runtime", "done", this.pendingRuntimeResults.length > 0
                ? `Reused ${this.pendingRuntimeResults.length} cached runtime issue(s)`
                : "Reused cached runtime guideline mapping");
            this.pushRuntimeUpdate("done", this.pendingRuntimeResults.length > 0
                ? `Skipping runtime analysis — reusing ${this.pendingRuntimeResults.length} cached runtime-verified contrast issue(s).`
                : "Skipping runtime analysis — guidelines already mapped.", [
                this.pendingRuntimeResults.length > 0
                    ? "Cached runtime-backed contrast findings are ready for validation."
                    : "Cached runtime guideline mapping is already available.",
            ]);
            return;
        }
        this.pushPhaseStatus("runtime", "analyzing", "Running wcag_mapper");
        this.pushRuntimeUpdate("analyzing", "Running runtime analysis...", [
            "Launching wcag_mapper against the running project.",
        ]);
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
        this.pushRuntimeUpdate("analyzing", "Runtime scan finished. Mapping results...", [
            "Applying scoped guideline mapping to the selected files.",
        ]);
        const targetFileIds = this.todoList.map((todo) => (0, db_1.upsertFile)(this.projectId, todo.file));
        (0, db_1.clearRuntimeAnalysisForFiles)(targetFileIds);
        this.contrastIssues = [];
        this.pendingRuntimeResults = [];
        for (let index = 0; index < this.todoList.length; index++) {
            const fileId = targetFileIds[index];
            (0, db_1.markFileRuntimeAnalyzed)(fileId, true);
        }
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
                if ((0, ContrastProcessor_1.isContrastGuideline)(g.scId))
                    continue;
                (0, db_1.upsertApplicableGuideline)(fileId, g.scId, `${g.title} [${g.category}] (Level ${g.level})`);
            }
        }
        for (const todo of this.todoList) {
            if (!this.isStylesheetFile(todo.file))
                continue;
            const fileId = (0, db_1.upsertFile)(this.projectId, todo.file);
            for (const guideline of agentConstants_1.STYLESHEET_FALLBACK_GUIDELINES) {
                (0, db_1.upsertApplicableGuideline)(fileId, guideline.wcag_id, guideline.description);
            }
        }
        this.push("SET_PROGRESS", {
            percent: 20,
            label: "Runtime analysis complete",
        });
        this.contrastIssues = (0, ContrastProcessor_1.extractContrastFailures)(scopedReport);
        for (const ci of this.contrastIssues) {
            const fullPath = path.isAbsolute(ci.filePath)
                ? ci.filePath
                : path.join(params.rootPath, ci.filePath);
            const fileId = (0, db_1.upsertFile)(this.projectId, fullPath);
            (0, db_1.upsertApplicableGuideline)(fileId, ci.guideline, `Contrast failure verified by runtime engine [${ci.guideline}]`);
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
        this.pushRuntimeUpdate("done", `Runtime analysis complete — mapped ${scopedReport.summary.uniqueGuidelines} guideline(s) across ${scopedReport.summary.files} file(s).`, [
            `${scopedReport.summary.contrastFailures} contrast failure(s) detected${this.contrastIssues.length > 0 ? " and stored as verified failures." : "."}`,
        ]);
        this.pushPhaseStatus("runtime", "done", `Mapped ${scopedReport.summary.uniqueGuidelines} guideline(s) across ${scopedReport.summary.files} file(s)`);
    }
    /* ================================================================ *
     *  Phase 3 – Granular Audit Loop (sequential, cached)               *
     * ================================================================ */
    async phaseAudit(params) {
        const total = this.todoList.length;
        let processed = 0;
        const targetFileIds = this.todoList
            .map((todo) => (0, db_1.getFileId)(this.projectId, todo.file))
            .filter((fileId) => typeof fileId === "number");
        (0, db_1.clearAuditResultsForFiles)(targetFileIds, "llm");
        this.pushPhaseStatus("audit", total > 0 ? "analyzing" : "done", total > 0 ? "Starting file audit" : "No files selected for audit", {
            completed: 0,
            total,
        });
        for (let i = 0; i < total; i++) {
            const todo = this.todoList[i];
            const fileId = (0, db_1.getFileId)(this.projectId, todo.file);
            if (!fileId) {
                todo.status = "skipped";
                todo.reason = "File not registered in database";
                this.push("SYNC_TODO", { todos: [...this.todoList] });
                this.pushAuditFileComplete({
                    filePath: todo.file,
                    guidelineTotal: 0,
                    status: "skipped",
                    summary: "Skipped — file was not registered in the database.",
                    passCount: 0,
                    failCount: 0,
                    naCount: 0,
                });
                continue;
            }
            let content;
            try {
                content = fs.readFileSync(todo.file, "utf-8");
                (0, db_1.setFileHash)(fileId, this.hashFileContent(content));
            }
            catch {
                todo.status = "error";
                todo.reason = "Cannot read file";
                (0, db_1.updateFileStatus)(fileId, "error");
                this.push("SYNC_TODO", { todos: [...this.todoList] });
                this.pushAuditFileComplete({
                    filePath: todo.file,
                    guidelineTotal: 0,
                    status: "error",
                    summary: "Unable to read file contents.",
                    passCount: 0,
                    failCount: 0,
                    naCount: 0,
                });
                continue;
            }
            const guidelines = this.getGuidelinesForAudit(fileId, todo.file);
            const ignoredIds = new Set((0, db_1.getIgnoredGuidelines)(fileId));
            const guidelinesToCheck = guidelines.filter((guideline) => !ignoredIds.has(guideline.wcag_id));
            if (guidelines.length === 0) {
                todo.status = "skipped";
                todo.reason = this.isStylesheetFile(todo.file)
                    ? "No applicable non-contrast stylesheet checks remain"
                    : "Only runtime-managed contrast checks apply";
                (0, db_1.updateFileStatus)(fileId, "skipped");
                this.push("SYNC_TODO", { todos: [...this.todoList] });
                this.pushAuditFileComplete({
                    filePath: todo.file,
                    guidelineTotal: 0,
                    status: "skipped",
                    summary: todo.reason,
                    passCount: 0,
                    failCount: 0,
                    naCount: 0,
                });
                continue;
            }
            if (guidelinesToCheck.length === 0) {
                todo.status = "skipped";
                todo.reason = "All applicable checks for this file are currently ignored";
                (0, db_1.updateFileStatus)(fileId, "skipped");
                this.push("SYNC_TODO", { todos: [...this.todoList] });
                this.pushAuditFileComplete({
                    filePath: todo.file,
                    guidelineTotal: guidelines.length,
                    status: "skipped",
                    summary: todo.reason,
                    passCount: 0,
                    failCount: 0,
                    naCount: 0,
                });
                continue;
            }
            todo.status = "scanning";
            this.push("SYNC_TODO", { todos: [...this.todoList] });
            (0, db_1.updateFileStatus)(fileId, "analyzing");
            this.pushAuditFileStart(todo.file, i + 1, total, guidelinesToCheck.length);
            const basename = path.basename(todo.file);
            const threadId = `audit-${i}`;
            const auditableInventory = (0, sourceInventory_1.extractAuditableElementInventory)(content);
            this.llm.createThread(threadId, prompts_1.AUDIT_SYSTEM_PROMPT);
            await this.llm.send(threadId, (0, prompts_1.buildFilePrimePrompt)(basename, content, auditableInventory));
            let passCount = 0;
            let failCount = 0;
            let naCount = 0;
            let checkedCount = 0;
            for (const guideline of guidelinesToCheck) {
                let latestStatus = "passed";
                try {
                    const reply = await this.llm.send(threadId, (0, prompts_1.buildGuidelineCheckPrompt)(guideline.wcag_id, guideline.description), { json: true });
                    const result = JSON.parse(reply);
                    if (result.status === "na") {
                        naCount++;
                        latestStatus = "na";
                    }
                    else if (result.status === "passed") {
                        passCount++;
                        latestStatus = "passed";
                    }
                    else {
                        failCount++;
                        latestStatus = "failed";
                        const dedupedIssues = (0, issueHelpers_1.dedupeGuidelineIssues)(result.issues || []);
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
                checkedCount++;
                this.pushAuditGuidelineProgress({
                    filePath: todo.file,
                    guidelineId: guideline.wcag_id,
                    guidelineDescription: guideline.description,
                    guidelineIndex: checkedCount,
                    guidelineTotal: guidelinesToCheck.length,
                    latestStatus,
                    passCount,
                    failCount,
                    naCount,
                });
            }
            this.llm.dropThread(threadId);
            const total_checks = passCount + failCount + naCount;
            const score = total_checks > 0
                ? Math.round(((passCount + naCount) / total_checks) * 100)
                : 100;
            (0, db_1.updateFileStatus)(fileId, "done", score);
            todo.status = "done";
            todo.reason = `Passed: ${passCount}, Failed: ${failCount}, N/A: ${naCount}`;
            this.push("SYNC_TODO", { todos: [...this.todoList] });
            this.pushAuditFileComplete({
                filePath: todo.file,
                guidelineTotal: guidelinesToCheck.length,
                status: "done",
                summary: `Completed ${guidelinesToCheck.length} guideline check(s).`,
                passCount,
                failCount,
                naCount,
            });
            processed++;
            const pct = 20 + Math.round((processed / total) * 55);
            this.push("SET_PROGRESS", {
                percent: pct,
                label: `Audited ${processed}/${total} files`,
            });
        }
        if (this.pendingRuntimeResults.length > 0) {
            for (const result of this.pendingRuntimeResults) {
                this.push("NEW_AUDIT_RESULT", result);
            }
            this.pendingRuntimeResults = [];
        }
        this.pushPhaseStatus("audit", "done", "File audit complete", {
            completed: total,
            total,
        });
    }
    /* ================================================================ *
     *  Phase 4 – Final Validation (LLM-as-a-Judge)                     *
     * ================================================================ */
    async phaseValidate(params) {
        const filesWithFailures = this.todoList.filter((t) => t.status === "done");
        this.pushPhaseStatus("validate", filesWithFailures.length > 0 ? "analyzing" : "done", filesWithFailures.length > 0
            ? "Running LLM-as-Judge validation"
            : "No files required validation", {
            completed: 0,
            total: filesWithFailures.length,
        });
        this.pushValidationUpdate(filesWithFailures.length > 0 ? "analyzing" : "done", filesWithFailures.length > 0
            ? "Running final validation (LLM-as-a-Judge)."
            : "No files required validation.", {
            completed: 0,
            total: filesWithFailures.length,
        });
        this.push("SET_PROGRESS", { percent: 75, label: "Validating findings…" });
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
            this.llm.createThread(threadId, prompts_1.VALIDATE_SYSTEM_PROMPT);
            const failureList = failed
                .map((g) => `- ${g.wcag_id}: ${g.description}`)
                .join("\n");
            const runtimeFailureList = fileContrastIssues
                .map((issue) => `- ${issue.guideline}: ${issue.issueDescription}${issue.selector ? ` [selector: ${issue.selector}]` : ""}${issue.snippet ? ` [snippet: ${issue.snippet}]` : ""} [source: runtime]`)
                .join("\n");
            const combinedFailureList = [failureList, runtimeFailureList]
                .filter(Boolean)
                .join("\n");
            const prompt = (0, prompts_1.buildValidatePrompt)(basename, content, combinedFailureList);
            this.pushValidationUpdate("analyzing", `Validating ${basename}...`, {
                completed: validated,
                total: filesWithFailures.length,
            }, todo.file);
            try {
                const reply = await this.llm.send(threadId, prompt, { json: true });
                const validation = JSON.parse(reply);
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
            this.pushPhaseStatus("validate", validated >= filesWithFailures.length ? "done" : "analyzing", validated >= filesWithFailures.length
                ? "Validation complete"
                : `Validated ${validated} of ${filesWithFailures.length} files`, {
                completed: validated,
                total: filesWithFailures.length,
            });
            this.pushValidationUpdate(validated >= filesWithFailures.length ? "done" : "analyzing", validated >= filesWithFailures.length
                ? "Validation complete"
                : `Validated ${validated} of ${filesWithFailures.length} files`, {
                completed: validated,
                total: filesWithFailures.length,
            }, todo.file);
            const pct = 75 +
                Math.round((validated / Math.max(filesWithFailures.length, 1)) * 25);
            this.push("SET_PROGRESS", {
                percent: Math.min(pct, 100),
                label: `Validated ${validated}/${filesWithFailures.length} files`,
            });
        }
        if (filesWithFailures.length === 0) {
            this.pushPhaseStatus("validate", "done", "No files required validation", {
                completed: 0,
                total: 0,
            });
            this.pushValidationUpdate("done", "No files required validation.", {
                completed: 0,
                total: 0,
            });
        }
    }
}
exports.MainAgent = MainAgent;
//# sourceMappingURL=MainAgent.js.map