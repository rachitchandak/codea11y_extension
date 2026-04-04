/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/ProjectScanner.ts"
/*!*******************************!*\
  !*** ./src/ProjectScanner.ts ***!
  \*******************************/
(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.buildFileTree = buildFileTree;
const fs = __importStar(__webpack_require__(/*! fs */ "fs"));
const path = __importStar(__webpack_require__(/*! path */ "path"));
/* ------------------------------------------------------------------ *
 *  Directories to skip during scanning                                *
 * ------------------------------------------------------------------ */
const IGNORED_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    ".vscode",
    "out",
    ".next",
    "build",
    "coverage",
    "__pycache__",
    ".cache",
    ".turbo",
]);
/* ------------------------------------------------------------------ *
 *  File extensions we consider auditable for accessibility             *
 * ------------------------------------------------------------------ */
const AUDITABLE_EXTENSIONS = new Set([
    ".html",
    ".htm",
    ".jsx",
    ".tsx",
    ".vue",
    ".svelte",
    ".astro",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".ejs",
    ".hbs",
    ".pug",
    ".erb",
]);
/* ------------------------------------------------------------------ *
 *  Build a recursive file tree from the workspace root                *
 * ------------------------------------------------------------------ */
function buildFileTree(rootPath) {
    return walkDir(rootPath, rootPath, path.basename(rootPath));
}
function walkDir(rootPath, dirPath, name) {
    const relativePath = path.relative(rootPath, dirPath) || ".";
    const node = {
        name,
        relativePath,
        type: "directory",
        children: [],
    };
    let entries;
    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    }
    catch {
        return node;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            if (!IGNORED_DIRS.has(entry.name)) {
                node.children.push(walkDir(rootPath, fullPath, entry.name));
            }
        }
        else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (AUDITABLE_EXTENSIONS.has(ext)) {
                node.children.push({
                    name: entry.name,
                    relativePath: path.relative(rootPath, fullPath),
                    type: "file",
                });
            }
        }
    }
    return node;
}


/***/ },

/***/ "./src/eventHandler.ts"
/*!*****************************!*\
  !*** ./src/eventHandler.ts ***!
  \*****************************/
(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.resetChatActivityState = resetChatActivityState;
exports.resetSidebarTodoState = resetSidebarTodoState;
exports.handleAgentEvent = handleAgentEvent;
const path = __importStar(__webpack_require__(/*! path */ "path"));
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
const ReportPanelProvider_1 = __webpack_require__(/*! ./providers/ReportPanelProvider */ "./src/providers/ReportPanelProvider.ts");
let sidebarTodoItems = [];
let sidebarWorkflowState = null;
let activityItems = new Map();
let nextActivityOrder = 1;
function syncWorkflowState(sidebarProvider) {
    sidebarProvider.postMessage({
        type: "UPDATE_WORKFLOW",
        payload: sidebarWorkflowState,
    });
}
function cloneTodoItems(todos) {
    return todos.map((todo) => ({ ...todo }));
}
function syncSidebarTodos(sidebarProvider) {
    sidebarProvider.postMessage({
        type: "UPDATE_TODO",
        payload: cloneTodoItems(sidebarTodoItems),
    });
}
function setSidebarTodos(todos) {
    sidebarTodoItems = cloneTodoItems(todos);
}
function buildCountLabel(completed, total) {
    if (typeof total !== "number" || total <= 0) {
        return undefined;
    }
    return `${completed ?? 0}/${total}`;
}
function updateSidebarTodo(id, updates) {
    const index = sidebarTodoItems.findIndex((todo) => todo.id === id);
    if (index === -1) {
        return;
    }
    const current = sidebarTodoItems[index];
    const patch = typeof updates === "function" ? updates(current) : updates;
    sidebarTodoItems = [...sidebarTodoItems];
    sidebarTodoItems[index] = {
        ...current,
        ...patch,
    };
}
function getSidebarTodo(id) {
    return sidebarTodoItems.find((todo) => todo.id === id);
}
function createAssistantMessage(content) {
    return {
        kind: "message",
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        isStreaming: false,
    };
}
function toActivityId(filePath) {
    return `audit:${filePath.replace(/\\/g, "/").toLowerCase()}`;
}
function createLines(values) {
    return values
        .filter((value) => Boolean(value && value.trim()))
        .map((text, index) => ({ id: `${index}:${text}`, text }));
}
function upsertActivity(sidebarProvider, activity) {
    const existing = activityItems.get(activity.id);
    const next = {
        kind: "activity",
        order: existing?.order ?? activity.order ?? nextActivityOrder++,
        autoCollapseOnDone: true,
        ...existing,
        ...activity,
    };
    activityItems.set(next.id, next);
    sidebarProvider.postMessage({
        type: "UPSERT_CHAT_ACTIVITY",
        payload: next,
    });
}
function resetChatActivityState(sidebarProvider) {
    activityItems = new Map();
    nextActivityOrder = 1;
    if (sidebarProvider) {
        sidebarProvider.postMessage({ type: "RESET_CHAT_ACTIVITY" });
    }
}
function resetSidebarTodoState(sidebarProvider) {
    sidebarTodoItems = [];
    sidebarWorkflowState = null;
    if (sidebarProvider) {
        syncSidebarTodos(sidebarProvider);
        syncWorkflowState(sidebarProvider);
    }
}
/**
 * Handle NDJSON events streamed from the MainAgent on the server.
 */
function handleAgentEvent(evt, query, sidebarProvider, runAgentAudit) {
    switch (evt.event) {
        case "WORKFLOW_CONTEXT": {
            sidebarWorkflowState = evt.data;
            syncWorkflowState(sidebarProvider);
            break;
        }
        case "WORKFLOW_TODOS": {
            setSidebarTodos(evt.data.todos || []);
            syncSidebarTodos(sidebarProvider);
            break;
        }
        case "PHASE_STATUS": {
            const payload = evt.data;
            updateSidebarTodo(payload.phase, (todo) => ({
                status: payload.status,
                detail: payload.detail || todo.detail,
                countLabel: payload.phase === "audit" || payload.phase === "validate"
                    ? buildCountLabel(payload.completed, payload.total)
                    : todo.countLabel,
            }));
            syncSidebarTodos(sidebarProvider);
            break;
        }
        case "SYNC_TODO": {
            const todos = evt.data.todos || [];
            const total = todos.length;
            const completed = todos.filter((t) => ["done", "skipped", "error"].includes(t.status)).length;
            const hasActiveScan = todos.some((t) => t.status === "scanning");
            const hasErrors = todos.some((t) => t.status === "error");
            updateSidebarTodo("audit", {
                status: total === 0
                    ? "pending"
                    : completed >= total
                        ? hasErrors
                            ? "error"
                            : "done"
                        : hasActiveScan || completed > 0
                            ? "analyzing"
                            : "pending",
                detail: total === 0
                    ? "Waiting for file selection"
                    : completed >= total
                        ? hasErrors
                            ? "File audit finished with one or more errors"
                            : "File audit complete"
                        : `Audited ${completed} of ${total} files`,
                countLabel: buildCountLabel(completed, total),
            });
            if (getSidebarTodo("runtime")?.status === "analyzing" && (hasActiveScan || completed > 0)) {
                updateSidebarTodo("runtime", {
                    status: "done",
                    detail: "Runtime analysis complete",
                });
            }
            syncSidebarTodos(sidebarProvider);
            break;
        }
        case "INTENT_SUMMARY": {
            const payload = evt.data;
            upsertActivity(sidebarProvider, {
                id: "intent-summary",
                phase: "intent",
                heading: "Analyzing your project",
                status: "done",
                summary: `Identified ${payload.totalFiles} file(s) to audit.`,
                lines: createLines([
                    payload.runtimeMode === "required"
                        ? "Runtime analysis will run for this audit."
                        : "Runtime analysis already available from a previous run.",
                ]),
            });
            break;
        }
        case "RUNTIME_UPDATE": {
            const payload = evt.data;
            upsertActivity(sidebarProvider, {
                id: "runtime-analysis",
                phase: "runtime",
                heading: "Runtime analysis",
                status: payload.status,
                summary: payload.summary,
                countLabel: payload.countLabel,
                lines: createLines(payload.details || []),
            });
            break;
        }
        case "AUDIT_FILE_START": {
            const payload = evt.data;
            upsertActivity(sidebarProvider, {
                id: toActivityId(payload.filePath),
                phase: "audit",
                heading: `Auditing ${path.basename(payload.filePath)}`,
                status: "analyzing",
                summary: `Guideline 0/${payload.guidelineTotal}`,
                countLabel: `0/${payload.guidelineTotal}`,
                lines: createLines([
                    `File ${payload.fileIndex}/${payload.fileTotal}`,
                    "Passed 0, Failed 0, N/A 0",
                ]),
            });
            break;
        }
        case "AUDIT_GUIDELINE_PROGRESS": {
            const payload = evt.data;
            upsertActivity(sidebarProvider, {
                id: toActivityId(payload.filePath),
                phase: "audit",
                heading: `Auditing ${path.basename(payload.filePath)}`,
                status: "analyzing",
                summary: `Guideline ${payload.guidelineIndex}/${payload.guidelineTotal}`,
                countLabel: `${payload.guidelineIndex}/${payload.guidelineTotal}`,
                lines: createLines([
                    `Checking ${payload.guidelineId} — ${payload.guidelineDescription}`,
                    `Latest result: ${payload.latestStatus.toUpperCase()}`,
                    `Passed ${payload.passCount}, Failed ${payload.failCount}, N/A ${payload.naCount}`,
                ]),
            });
            break;
        }
        case "AUDIT_FILE_COMPLETE": {
            const payload = evt.data;
            upsertActivity(sidebarProvider, {
                id: toActivityId(payload.filePath),
                phase: "audit",
                heading: `Auditing ${path.basename(payload.filePath)}`,
                status: payload.status,
                summary: payload.summary,
                countLabel: `${payload.guidelineTotal}/${payload.guidelineTotal}`,
                lines: createLines([
                    `Passed ${payload.passCount}, Failed ${payload.failCount}, N/A ${payload.naCount}`,
                ]),
            });
            break;
        }
        case "VALIDATION_UPDATE": {
            const payload = evt.data;
            upsertActivity(sidebarProvider, {
                id: "validation-summary",
                phase: "validate",
                heading: "Final validation",
                status: payload.status,
                summary: payload.summary,
                countLabel: payload.total && payload.total > 0
                    ? `${payload.completed ?? 0}/${payload.total}`
                    : undefined,
                lines: createLines([
                    payload.filePath ? `Current file: ${path.basename(payload.filePath)}` : undefined,
                ]),
            });
            break;
        }
        case "REPORT_READY": {
            break;
        }
        case "AGENT_MESSAGE": {
            const content = String(evt.data.content || "");
            if (!content) {
                break;
            }
            sidebarProvider.postMessage({
                type: "STREAM_CHAT",
                payload: createAssistantMessage(content),
            });
            break;
        }
        case "NEW_AUDIT_RESULT": {
            (0, ReportPanelProvider_1.postToReportPanel)({
                type: "NEW_AUDIT_RESULT",
                payload: evt.data,
            });
            break;
        }
        case "NEED_URL": {
            upsertActivity(sidebarProvider, {
                id: "runtime-analysis",
                phase: "runtime",
                heading: "Runtime analysis",
                status: "error",
                summary: "Project URL required to continue.",
                lines: createLines([
                    "Provide the URL where the project is currently running.",
                ]),
            });
            vscode.window
                .showInputBox({
                prompt: String(evt.data.message ||
                    "Provide the URL where your project is running"),
                placeHolder: "http://localhost:3000",
            })
                .then((url) => {
                if (url) {
                    runAgentAudit(query, url);
                }
            });
            break;
        }
        case "VALIDATION_RESULT": {
            (0, ReportPanelProvider_1.postToReportPanel)({
                type: "VALIDATION_RESULT",
                payload: evt.data,
            });
            break;
        }
        case "DONE": {
            if (getSidebarTodo("audit")?.status === "analyzing") {
                updateSidebarTodo("audit", {
                    status: "done",
                    detail: "File audit complete",
                });
            }
            if (getSidebarTodo("validate")?.status === "analyzing") {
                updateSidebarTodo("validate", {
                    status: "done",
                    detail: "Validation complete",
                });
            }
            if (sidebarWorkflowState && sidebarWorkflowState.status === "analyzing") {
                sidebarWorkflowState = {
                    ...sidebarWorkflowState,
                    status: "done",
                };
                syncWorkflowState(sidebarProvider);
            }
            syncSidebarTodos(sidebarProvider);
            vscode.window.showInformationMessage("Codea11y: Audit complete!");
            break;
        }
        case "ERROR": {
            const message = String(evt.data.message || "Unknown error");
            if (sidebarWorkflowState) {
                sidebarWorkflowState = {
                    ...sidebarWorkflowState,
                    status: "error",
                    detail: message,
                };
                syncWorkflowState(sidebarProvider);
            }
            if (getSidebarTodo("validate")?.status === "analyzing") {
                updateSidebarTodo("validate", {
                    status: "error",
                    detail: message,
                });
                upsertActivity(sidebarProvider, {
                    id: "validation-summary",
                    phase: "validate",
                    heading: "Final validation",
                    status: "error",
                    summary: message,
                    lines: [],
                });
            }
            else if (getSidebarTodo("audit")?.status === "analyzing") {
                updateSidebarTodo("audit", {
                    status: "error",
                    detail: message,
                });
            }
            else {
                updateSidebarTodo("runtime", {
                    status: "error",
                    detail: message,
                });
                upsertActivity(sidebarProvider, {
                    id: "runtime-analysis",
                    phase: "runtime",
                    heading: "Runtime analysis",
                    status: "error",
                    summary: message,
                    lines: [],
                });
            }
            syncSidebarTodos(sidebarProvider);
            sidebarProvider.postMessage({
                type: "STREAM_CHAT",
                payload: createAssistantMessage(`Audit failed: ${message}`),
            });
            vscode.window.showWarningMessage(`Codea11y: ${message}`);
            break;
        }
    }
}


/***/ },

/***/ "./src/extension.ts"
/*!**************************!*\
  !*** ./src/extension.ts ***!
  \**************************/
(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
const SidebarProvider_1 = __webpack_require__(/*! ./providers/SidebarProvider */ "./src/providers/SidebarProvider.ts");
const ReportPanelProvider_1 = __webpack_require__(/*! ./providers/ReportPanelProvider */ "./src/providers/ReportPanelProvider.ts");
const ProjectScanner_1 = __webpack_require__(/*! ./ProjectScanner */ "./src/ProjectScanner.ts");
const serverClient_1 = __webpack_require__(/*! ./serverClient */ "./src/serverClient.ts");
const eventHandler_1 = __webpack_require__(/*! ./eventHandler */ "./src/eventHandler.ts");
const issueUtils_1 = __webpack_require__(/*! ./webview/shared/issueUtils */ "./src/webview/shared/issueUtils.ts");
function normalizePath(value) {
    return value.replace(/\\/g, "/");
}
function flattenAuditableFiles(node, rootPath) {
    if (node.type === "file") {
        return [normalizePath(vscode.Uri.joinPath(vscode.Uri.file(rootPath), node.relativePath).fsPath)];
    }
    return (node.children || []).flatMap((child) => flattenAuditableFiles(child, rootPath));
}
function normalizeReportIssue(issue) {
    return {
        ...issue,
        filePath: normalizePath(issue.filePath),
        guideline: (0, issueUtils_1.normalizeGuidelineLabel)(issue.guideline),
        snippet: (0, issueUtils_1.sanitizeIssueSnippet)(issue.snippet),
    };
}
function buildGroupedIssues(results) {
    const mergedResults = new Map();
    for (const issue of results) {
        const mergeKey = (0, issueUtils_1.buildIssueMergeKey)(issue);
        const existing = mergedResults.get(mergeKey);
        mergedResults.set(mergeKey, existing ? (0, issueUtils_1.mergeIssues)(existing, issue) : issue);
    }
    const groups = new Map();
    for (const issue of mergedResults.values()) {
        const key = (0, issueUtils_1.buildComponentGroupKey)(issue);
        const existing = groups.get(key);
        if (!existing) {
            groups.set(key, {
                key,
                filePath: issue.filePath,
                lineNumber: issue.lineNumber,
                selector: issue.selector,
                label: (0, issueUtils_1.getComponentGroupLabel)(issue),
                issues: [issue],
            });
            continue;
        }
        existing.issues.push(issue);
        if (existing.lineNumber === undefined) {
            existing.lineNumber = issue.lineNumber;
        }
        if (!existing.selector && issue.selector) {
            existing.selector = issue.selector;
        }
    }
    return [...groups.values()].map((group) => ({
        ...group,
        issues: [...group.issues].sort((left, right) => {
            const severityDiff = (0, issueUtils_1.severityRank)(right.severity) - (0, issueUtils_1.severityRank)(left.severity);
            if (severityDiff !== 0)
                return severityDiff;
            const guidelineDiff = (0, issueUtils_1.normalizeGuidelineLabel)(left.guideline).localeCompare((0, issueUtils_1.normalizeGuidelineLabel)(right.guideline));
            if (guidelineDiff !== 0)
                return guidelineDiff;
            return String(left.id).localeCompare(String(right.id));
        }),
    }));
}
function buildSeverityCounts(results) {
    return results.reduce((acc, result) => {
        if (!result.ignored) {
            acc[result.severity] += 1;
        }
        return acc;
    }, { error: 0, warning: 0, info: 0 });
}
function isAuditedFile(file) {
    return (file.scanStatus !== "pending" ||
        file.accessibilityScore !== null ||
        file.results.length > 0);
}
function createAssistantMessage(content) {
    return {
        kind: "message",
        id: crypto.randomUUID(),
        role: "assistant",
        content,
        isStreaming: false,
    };
}
function buildProjectReportPayload(args) {
    const normalizedAuditableFiles = args.auditableFiles.map(normalizePath).sort((left, right) => left.localeCompare(right));
    const auditedFiles = args.snapshotFiles
        .map((file) => ({
        ...file,
        filePath: normalizePath(file.filePath),
        results: file.results.map(normalizeReportIssue),
    }))
        .filter(isAuditedFile)
        .sort((left, right) => left.filePath.localeCompare(right.filePath));
    const fileTabs = auditedFiles.map((file) => {
        const groupedIssues = buildGroupedIssues(file.results);
        const issueCount = file.results.filter((issue) => !issue.ignored).length;
        return {
            filePath: file.filePath,
            fileHash: file.fileHash,
            issueCount,
            accessibilityScore: file.accessibilityScore,
            scanStatus: file.scanStatus,
            runtimeAnalyzed: file.runtimeAnalyzed,
            results: file.results,
            groupedIssues,
            fileEntries: [{ filePath: file.filePath, issueCount }],
            counts: buildSeverityCounts(file.results),
        };
    });
    const auditedSet = new Set(fileTabs.map((tab) => normalizePath(tab.filePath)));
    const unauditedFiles = normalizedAuditableFiles.filter((filePath) => !auditedSet.has(filePath));
    const scoredFiles = fileTabs.filter((tab) => typeof tab.accessibilityScore === "number");
    const averageAccessibilityScore = scoredFiles.length > 0
        ? Math.round(scoredFiles.reduce((sum, tab) => sum + (tab.accessibilityScore || 0), 0) /
            scoredFiles.length)
        : null;
    return {
        kind: "project",
        reportId: `project:${args.projectPath}`,
        projectPath: args.projectPath,
        projectName: args.projectName,
        createdAt: args.createdAt,
        source: "snapshot",
        overview: {
            totalAuditableFiles: normalizedAuditableFiles.length,
            auditedFileCount: fileTabs.length,
            unauditedFileCount: unauditedFiles.length,
            averageAccessibilityScore,
            auditedFiles: fileTabs.map((tab) => ({
                filePath: tab.filePath,
                fileHash: tab.fileHash,
                issueCount: tab.issueCount,
                accessibilityScore: tab.accessibilityScore,
                scanStatus: tab.scanStatus,
            })),
            unauditedFiles,
        },
        fileTabs,
    };
}
/* ================================================================== *
 *  activate()                                                         *
 * ================================================================== */
async function activate(context) {
    // ── Connect to standalone server ────────────────────────────────
    try {
        await (0, serverClient_1.waitForServer)();
    }
    catch (err) {
        vscode.window.showErrorMessage(`Codea11y: ${err.message}`);
    }
    // ── Sidebar Chat View ─────────────────────────────────────────────
    const sidebarProvider = new SidebarProvider_1.SidebarProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(SidebarProvider_1.SidebarProvider.viewType, sidebarProvider));
    // ── Run agent-driven audit (MainAgent NDJSON stream) ──────────────
    async function runAgentAudit(query, projectUrl) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("Codea11y: No workspace folder open.");
            return;
        }
        const rootPath = workspaceFolder.uri.fsPath;
        (0, eventHandler_1.resetSidebarTodoState)(sidebarProvider);
        (0, eventHandler_1.resetChatActivityState)(sidebarProvider);
        (0, ReportPanelProvider_1.openReportPanel)(context.extensionUri);
        (0, ReportPanelProvider_1.postToReportPanel)({ type: "RESET_REPORT", payload: undefined });
        try {
            const fileTree = (0, ProjectScanner_1.buildFileTree)(rootPath);
            const response = await fetch("http://localhost:7544/agent/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userQuery: query,
                    fileTree,
                    rootPath,
                    projectUrl,
                }),
            });
            if (!response.ok || !response.body) {
                throw new Error(`Server returned ${response.status}`);
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop();
                for (const line of lines) {
                    if (!line.trim())
                        continue;
                    try {
                        const evt = JSON.parse(line);
                        (0, eventHandler_1.handleAgentEvent)(evt, query, sidebarProvider, runAgentAudit);
                    }
                    catch {
                        // skip malformed lines
                    }
                }
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Codea11y: Agent audit failed – ${err.message}`);
            sidebarProvider.postMessage({
                type: "STREAM_CHAT",
                payload: {
                    kind: "message",
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: `Audit failed: ${err.message}`,
                    isStreaming: false,
                },
            });
        }
    }
    async function openActiveFileReport(projectUrl) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const activeFilePath = vscode.window.activeTextEditor?.document.uri.fsPath;
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("Codea11y: No workspace folder open.");
            return;
        }
        if (!activeFilePath) {
            vscode.window.showErrorMessage("Codea11y: Open a source file to retrieve or generate its report.");
            return;
        }
        (0, ReportPanelProvider_1.openReportPanel)(context.extensionUri);
        (0, ReportPanelProvider_1.postToReportPanel)({ type: "RESET_REPORT", payload: undefined });
        try {
            const report = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Codea11y: Opening accessibility report",
            }, async () => (0, serverClient_1.retrieveOrInitiateReport)({
                filePath: activeFilePath,
                rootPath: workspaceFolder.uri.fsPath,
                projectUrl,
            }));
            (0, ReportPanelProvider_1.postToReportPanel)({
                type: "REPORT_READY",
                payload: report,
            });
        }
        catch (err) {
            if (err instanceof serverClient_1.ServerNeedsUrlError) {
                const url = await vscode.window.showInputBox({
                    prompt: err.message,
                    placeHolder: "http://localhost:3000",
                });
                if (url) {
                    await openActiveFileReport(url);
                }
                return;
            }
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Codea11y: Failed to open report - ${message}`);
        }
    }
    async function openProjectReports() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("Codea11y: No workspace folder open.");
            return;
        }
        const rootPath = workspaceFolder.uri.fsPath;
        const fileTree = (0, ProjectScanner_1.buildFileTree)(rootPath);
        const auditableFiles = flattenAuditableFiles(fileTree, rootPath);
        try {
            const snapshot = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Codea11y: Opening project reports",
            }, async () => (0, serverClient_1.getProjectAuditSnapshot)(rootPath));
            const reportPayload = buildProjectReportPayload({
                projectPath: snapshot.projectPath,
                projectName: snapshot.projectName,
                createdAt: snapshot.createdAt,
                auditableFiles,
                snapshotFiles: snapshot.files,
            });
            (0, ReportPanelProvider_1.openReportPanel)(context.extensionUri);
            (0, ReportPanelProvider_1.postToReportPanel)({ type: "RESET_REPORT", payload: undefined });
            (0, ReportPanelProvider_1.postToReportPanel)({
                type: "REPORT_READY",
                payload: reportPayload,
            });
            sidebarProvider.postMessage({
                type: "STREAM_CHAT",
                payload: createAssistantMessage(`Opened project reports for ${reportPayload.overview.auditedFileCount} audited file${reportPayload.overview.auditedFileCount === 1 ? "" : "s"}.`),
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Codea11y: Failed to open project reports - ${message}`);
            sidebarProvider.postMessage({
                type: "STREAM_CHAT",
                payload: createAssistantMessage(`Project reports failed: ${message}`),
            });
        }
    }
    // ── Wire SEND_QUERY → agent audit flow ────────────────────────────
    sidebarProvider.onSendQuery = (query, _chatId) => {
        if (/^\/reports?\b/i.test(query.trim())) {
            void openProjectReports();
            return;
        }
        void runAgentAudit(query);
    };
    // ── Wire IGNORE_ISSUE → server ───────────────────────────────────
    (0, ReportPanelProvider_1.onIgnoreIssue)(async (issueId) => {
        try {
            await (0, serverClient_1.ignoreIssueOnServer)(issueId);
            vscode.window.showInformationMessage(`Codea11y: Issue ${issueId} marked as ignored.`);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Codea11y: Failed to ignore issue – ${err.message}`);
        }
    });
    // ── Open Report Panel command ─────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand("codea11y.openReport", () => {
        void openActiveFileReport();
    }));
    // ── Start Audit command (from Command Palette) ────────────────────
    context.subscriptions.push(vscode.commands.registerCommand("codea11y.startAudit", async () => {
        const query = await vscode.window.showInputBox({
            prompt: "Describe your accessibility audit focus",
            placeHolder: "e.g., Audit all React components for WCAG AA compliance",
        });
        if (query) {
            runAgentAudit(query);
        }
    }));
}
function deactivate() {
    // Server is standalone — no cleanup needed
}


/***/ },

/***/ "./src/providers/ReportPanelProvider.ts"
/*!**********************************************!*\
  !*** ./src/providers/ReportPanelProvider.ts ***!
  \**********************************************/
(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.onIgnoreIssue = onIgnoreIssue;
exports.openReportPanel = openReportPanel;
exports.postToReportPanel = postToReportPanel;
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
const getNonce_1 = __webpack_require__(/*! ./getNonce */ "./src/providers/getNonce.ts");
let currentPanel;
let _ignoreIssueHandler;
let reportReady = false;
let pendingMessages = [];
let isSavingReport = false;
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function buildReportHtml(payload) {
    const createdAt = new Date().toLocaleString();
    const visibleIssueCount = payload.results.filter((issue) => !issue.ignored).length;
    const fileSections = payload.fileEntries
        .map(({ filePath, issueCount }) => {
        const groups = payload.groupedIssues.filter((group) => group.filePath === filePath);
        const groupMarkup = groups
            .map((group) => {
            const metadata = [
                group.lineNumber ? `<span>Line ${group.lineNumber}</span>` : "",
                group.selector ? `<span>${escapeHtml(group.selector)}</span>` : "",
            ]
                .filter(Boolean)
                .join("");
            const issuesMarkup = group.issues
                .map((issue) => {
                const issueBadges = [
                    `<span class="pill severity-${escapeHtml(issue.severity)}">${escapeHtml(issue.severity)}</span>`,
                    issue.source ? `<span class="pill">${escapeHtml(issue.source)}</span>` : "",
                    issue.ignored ? '<span class="pill ignored">ignored</span>' : "",
                ]
                    .filter(Boolean)
                    .join("");
                return `
                <details class="guideline" open>
                  <summary>
                    <span class="summary-title">${escapeHtml(issue.guideline)}</span>
                    <span class="pill-row">${issueBadges}</span>
                  </summary>
                  <div class="guideline-body">
                    ${issue.issueDescription ? `<p class="issue-copy">${escapeHtml(issue.issueDescription)}</p>` : ""}
                    ${issue.snippet ? `<pre>${escapeHtml(issue.snippet)}</pre>` : ""}
                    ${issue.suggestion ? `<p class="fix"><strong>How to fix:</strong> ${escapeHtml(issue.suggestion)}</p>` : ""}
                  </div>
                </details>`;
            })
                .join("");
            return `
            <details class="component" open>
              <summary>
                <div class="summary-copy">
                  <span class="summary-title">${escapeHtml(group.label)}</span>
                  <span class="component-meta">${metadata}</span>
                </div>
                <span class="component-count">${group.issues.length} guideline${group.issues.length === 1 ? "" : "s"}</span>
              </summary>
              <div class="component-body">
                ${issuesMarkup || '<p class="empty">No guidelines recorded for this component.</p>'}
              </div>
            </details>`;
        })
            .join("");
        return `
        <section class="file-section">
          <div class="file-head">
            <h2>${escapeHtml(filePath)}</h2>
            <span>${issueCount} active issue${issueCount === 1 ? "" : "s"}</span>
          </div>
          ${groupMarkup || '<p class="empty">No issues recorded for this file.</p>'}
        </section>`;
    })
        .join("");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Codea11y Audit Report</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --panel: #ffffff;
      --border: #d9e0ea;
      --text: #17202b;
      --muted: #5d6b7a;
      --error: #b42318;
      --warning: #b54708;
      --info: #175cd3;
      --ignored: #667085;
      --shadow: 0 18px 50px rgba(23, 32, 43, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px;
      background: linear-gradient(180deg, #f8fbff 0%, #eef4fb 100%);
      color: var(--text);
      font-family: "Segoe UI", Arial, sans-serif;
      line-height: 1.5;
    }
    .report {
      max-width: 1200px;
      margin: 0 auto;
    }
    .hero, .file-section, .component, .guideline {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--shadow);
    }
    .hero {
      padding: 24px;
      margin-bottom: 24px;
    }
    .hero h1, .file-head h2 {
      margin: 0;
    }
    .hero p {
      margin: 8px 0 0;
      color: var(--muted);
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-top: 20px;
    }
    .summary-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      background: #fbfcfe;
    }
    .summary-card strong {
      display: block;
      font-size: 1.5rem;
      margin-bottom: 4px;
    }
    .files {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .file-section {
      padding: 20px;
    }
    .file-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 16px;
    }
    .file-head span, .component-meta, .component-count, .fix, .issue-copy, .empty {
      color: var(--muted);
    }
    details {
      overflow: hidden;
    }
    details > summary {
      list-style: none;
      cursor: pointer;
    }
    details > summary::-webkit-details-marker {
      display: none;
    }
    .component {
      margin-top: 14px;
    }
    .component > summary,
    .guideline > summary {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 18px;
    }
    .component > summary::before,
    .guideline > summary::before {
      content: "+";
      width: 20px;
      font-weight: 700;
      color: var(--muted);
      flex: 0 0 auto;
    }
    .component[open] > summary::before,
    .guideline[open] > summary::before {
      content: "-";
    }
    .summary-copy {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
      flex: 1;
    }
    .summary-title {
      font-weight: 600;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .component-meta {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      font-size: 0.92rem;
    }
    .component-body {
      padding: 0 18px 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .guideline {
      border-radius: 14px;
      box-shadow: none;
    }
    .guideline-body {
      padding: 0 18px 18px 38px;
    }
    .pill-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      flex: 0 0 auto;
    }
    .pill {
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 0.8rem;
      border: 1px solid var(--border);
      text-transform: capitalize;
      background: #f8fafc;
      white-space: nowrap;
    }
    .severity-error {
      color: var(--error);
      border-color: rgba(180, 35, 24, 0.3);
      background: rgba(180, 35, 24, 0.08);
    }
    .severity-warning {
      color: var(--warning);
      border-color: rgba(181, 71, 8, 0.3);
      background: rgba(181, 71, 8, 0.08);
    }
    .severity-info {
      color: var(--info);
      border-color: rgba(23, 92, 211, 0.3);
      background: rgba(23, 92, 211, 0.08);
    }
    .ignored {
      color: var(--ignored);
    }
    pre {
      margin: 12px 0 0;
      padding: 12px;
      border-radius: 10px;
      overflow-x: auto;
      background: #0f172a;
      color: #e2e8f0;
      font-family: Consolas, "Courier New", monospace;
      font-size: 0.9rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
    @media (max-width: 720px) {
      body { padding: 16px; }
      .file-head,
      .component > summary,
      .guideline > summary {
        flex-direction: column;
      }
      .guideline-body {
        padding-left: 18px;
      }
    }
  </style>
</head>
<body>
  <main class="report">
    <section class="hero">
      <h1>Codea11y Audit Report</h1>
      <p>Generated ${escapeHtml(createdAt)}</p>
      <div class="summary-grid">
        <div class="summary-card">
          <strong>${visibleIssueCount}</strong>
          <span>Active issues</span>
        </div>
        <div class="summary-card">
          <strong>${payload.counts.error}</strong>
          <span>Errors</span>
        </div>
        <div class="summary-card">
          <strong>${payload.counts.warning}</strong>
          <span>Warnings</span>
        </div>
        <div class="summary-card">
          <strong>${payload.counts.info}</strong>
          <span>Info</span>
        </div>
        <div class="summary-card">
          <strong>${payload.fileEntries.length}</strong>
          <span>Files</span>
        </div>
      </div>
    </section>
    <section class="files">
      ${fileSections || '<section class="file-section"><p class="empty">No report data available.</p></section>'}
    </section>
  </main>
</body>
</html>`;
}
function postDownloadStatus(status) {
    if (!currentPanel) {
        return;
    }
    if (!reportReady) {
        pendingMessages.push(status);
        return;
    }
    currentPanel.webview.postMessage(status);
}
async function saveReportAsHtml(payload) {
    if (isSavingReport) {
        postDownloadStatus({
            type: "REPORT_DOWNLOAD_STATUS",
            payload: {
                status: "choosing-location",
                message: "Save dialog already open.",
            },
        });
        return;
    }
    isSavingReport = true;
    postDownloadStatus({
        type: "REPORT_DOWNLOAD_STATUS",
        payload: {
            status: "preparing",
            message: "Preparing HTML report...",
        },
    });
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const defaultUri = workspaceFolder
        ? vscode.Uri.joinPath(workspaceFolder.uri, payload.suggestedFileName)
        : undefined;
    try {
        const html = buildReportHtml(payload);
        postDownloadStatus({
            type: "REPORT_DOWNLOAD_STATUS",
            payload: {
                status: "choosing-location",
                message: "Choose where to save the report.",
            },
        });
        const targetUri = await vscode.window.showSaveDialog({
            defaultUri,
            filters: {
                HTML: ["html"],
            },
            saveLabel: "Download Report",
        });
        if (!targetUri) {
            postDownloadStatus({
                type: "REPORT_DOWNLOAD_STATUS",
                payload: {
                    status: "cancelled",
                    message: "Download cancelled.",
                },
            });
            return;
        }
        await vscode.workspace.fs.writeFile(targetUri, new TextEncoder().encode(html));
        postDownloadStatus({
            type: "REPORT_DOWNLOAD_STATUS",
            payload: {
                status: "saved",
                message: `Saved to ${targetUri.fsPath}`,
            },
        });
        vscode.window.showInformationMessage(`Codea11y: Report saved to ${targetUri.fsPath}`);
    }
    finally {
        isSavingReport = false;
    }
}
/**
 * Register a handler for IGNORE_ISSUE messages from the Report UI.
 */
function onIgnoreIssue(handler) {
    _ignoreIssueHandler = handler;
}
/**
 * Opens (or focuses) the full-width Report Panel.
 */
function openReportPanel(extensionUri) {
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.One);
        return currentPanel;
    }
    reportReady = false;
    pendingMessages = [];
    currentPanel = vscode.window.createWebviewPanel("codea11y.reportPanel", "Codea11y – Audit Report", vscode.ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
    });
    currentPanel.webview.html = getHtml(currentPanel.webview, extensionUri);
    // ── Receive messages from the Report UI ──────────────────────────
    currentPanel.webview.onDidReceiveMessage((message) => {
        switch (message.type) {
            case "WEBVIEW_READY": {
                reportReady = true;
                for (const pending of pendingMessages) {
                    currentPanel?.webview.postMessage(pending);
                }
                pendingMessages = [];
                return;
            }
            case "IGNORE_ISSUE":
                _ignoreIssueHandler?.(message.payload.issueId);
                return;
            case "DOWNLOAD_REPORT":
                void saveReportAsHtml(message.payload).catch((error) => {
                    const reason = error instanceof Error ? error.message : String(error);
                    isSavingReport = false;
                    postDownloadStatus({
                        type: "REPORT_DOWNLOAD_STATUS",
                        payload: {
                            status: "error",
                            message: reason,
                        },
                    });
                    vscode.window.showErrorMessage(`Codea11y: Failed to save report - ${reason}`);
                });
                return;
            case "RETRY_AUDIT":
                vscode.commands.executeCommand("codea11y.startAudit");
                return;
        }
    });
    currentPanel.onDidDispose(() => {
        currentPanel = undefined;
        reportReady = false;
        pendingMessages = [];
    });
    return currentPanel;
}
/**
 * Push a message into the report panel (if open).
 */
function postToReportPanel(message) {
    if (!currentPanel)
        return;
    if (!reportReady) {
        pendingMessages.push(message);
        return;
    }
    currentPanel.webview.postMessage(message);
}
/* -------------------------------------------------------------------- *
 *  HTML shell                                                          *
 * -------------------------------------------------------------------- */
function getHtml(webview, extensionUri) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "report.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "report.css"));
    const nonce = (0, getNonce_1.getNonce)();
    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             font-src ${webview.cspSource};
             script-src 'nonce-${nonce}';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Codea11y Report</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}


/***/ },

/***/ "./src/providers/SidebarProvider.ts"
/*!******************************************!*\
  !*** ./src/providers/SidebarProvider.ts ***!
  \******************************************/
(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SidebarProvider = void 0;
const vscode = __importStar(__webpack_require__(/*! vscode */ "vscode"));
const getNonce_1 = __webpack_require__(/*! ./getNonce */ "./src/providers/getNonce.ts");
/**
 * Provides the sidebar chat webview (WebviewViewProvider).
 */
class SidebarProvider {
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
        // In-memory placeholder – replace with DB calls
        this._demoChatSessions = [];
    }
    /* ------------------------------------------------------------------ *
     *  Called by VS Code when the sidebar view becomes visible            *
     * ------------------------------------------------------------------ */
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        webviewView.webview.html = this._getHtml(webviewView.webview);
        // ── Receive messages from the React UI ─────────────────────────
        webviewView.webview.onDidReceiveMessage((message) => {
            switch (message.type) {
                case "SEND_QUERY":
                    this._handleSendQuery(message.payload.query, message.payload.chatId);
                    return;
                case "RETRY_AUDIT":
                    vscode.commands.executeCommand("codea11y.startAudit");
                    return;
                case "GET_CHAT_LIST":
                    this._handleGetChatList();
                    return;
                case "CREATE_CHAT":
                    this._handleCreateChat();
                    return;
                case "DELETE_CHAT":
                    this._handleDeleteChat(message.payload.chatId);
                    return;
                case "OPEN_CHAT":
                    this._handleOpenChat(message.payload.chatId);
                    return;
                case "RENAME_CHAT":
                    this._handleRenameChat(message.payload.chatId, message.payload.title);
                    return;
            }
        });
    }
    /* ------------------------------------------------------------------ *
     *  Public helper – push a message into the sidebar webview            *
     * ------------------------------------------------------------------ */
    postMessage(message) {
        this._view?.webview.postMessage(message);
    }
    /* ------------------------------------------------------------------ *
     *  Handle a chat query (placeholder – wire your LLM backend here)    *
     * ------------------------------------------------------------------ */
    _handleSendQuery(query, chatId) {
        if (this.onSendQuery) {
            this.onSendQuery(query, chatId);
            return;
        }
        // Fallback echo when no handler is attached
        this.postMessage({
            type: "STREAM_CHAT",
            payload: {
                kind: "message",
                id: crypto.randomUUID(),
                role: "assistant",
                content: `Received your query: "${query}" in chat ${chatId}. LLM integration pending.`,
                isStreaming: false,
            },
        });
    }
    /* ------------------------------------------------------------------ *
     *  Chat-list handlers (placeholder – wire your DB backend here)      *
     * ------------------------------------------------------------------ */
    _handleGetChatList() {
        // TODO: Replace with actual DB query
        this.postMessage({
            type: "CHAT_LIST",
            payload: this._demoChatSessions,
        });
    }
    _handleCreateChat() {
        // Default title is the workspace root folder name
        const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name ?? "New Chat";
        const newChat = {
            id: crypto.randomUUID(),
            title: workspaceName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messageCount: 0,
        };
        this._demoChatSessions.unshift(newChat);
        this.postMessage({ type: "CHAT_CREATED", payload: newChat });
    }
    _handleDeleteChat(chatId) {
        this._demoChatSessions = this._demoChatSessions.filter((c) => c.id !== chatId);
        this.postMessage({ type: "CHAT_DELETED", payload: { chatId } });
    }
    _handleOpenChat(chatId) {
        const session = this._demoChatSessions.find((c) => c.id === chatId);
        this.postMessage({
            type: "CHAT_OPENED",
            payload: {
                chatId,
                title: session?.title ?? "Chat",
                messages: [], // TODO: Load from DB
            },
        });
    }
    _handleRenameChat(chatId, title) {
        const session = this._demoChatSessions.find((c) => c.id === chatId);
        if (session) {
            session.title = title;
            session.updatedAt = new Date().toISOString();
        }
        this.postMessage({ type: "CHAT_RENAMED", payload: { chatId, title } });
    }
    /* ------------------------------------------------------------------ *
     *  Generate the HTML shell that loads the React bundle                *
     * ------------------------------------------------------------------ */
    _getHtml(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "dist", "sidebar.js"));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "dist", "sidebar.css"));
        const nonce = (0, getNonce_1.getNonce)();
        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             font-src ${webview.cspSource};
             script-src 'nonce-${nonce}';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Codea11y Chat</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}
exports.SidebarProvider = SidebarProvider;
SidebarProvider.viewType = "codea11y.chatView";


/***/ },

/***/ "./src/providers/getNonce.ts"
/*!***********************************!*\
  !*** ./src/providers/getNonce.ts ***!
  \***********************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getNonce = getNonce;
/**
 * Generate a random nonce string for Content Security Policy headers.
 */
function getNonce() {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let i = 0; i < 32; i++) {
        nonce += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return nonce;
}


/***/ },

/***/ "./src/serverClient.ts"
/*!*****************************!*\
  !*** ./src/serverClient.ts ***!
  \*****************************/
(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ServerNeedsUrlError = void 0;
exports.waitForServer = waitForServer;
exports.ignoreIssueOnServer = ignoreIssueOnServer;
exports.retrieveOrInitiateReport = retrieveOrInitiateReport;
exports.getReportById = getReportById;
exports.getProjectAuditSnapshot = getProjectAuditSnapshot;
const path = __importStar(__webpack_require__(/*! path */ "path"));
class ServerNeedsUrlError extends Error {
    constructor(message) {
        super(message);
        this.needsUrl = true;
        this.name = "ServerNeedsUrlError";
    }
}
exports.ServerNeedsUrlError = ServerNeedsUrlError;
async function waitForServer(retries = 10, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch("http://localhost:7544/health");
            if (res.ok)
                return;
        }
        catch {
            // not ready yet
        }
        await new Promise((r) => setTimeout(r, delay));
    }
    throw new Error("Could not connect to Codea11y server on port 7544. " +
        "Please start the server manually before using the extension.");
}
async function ignoreIssueOnServer(issueId) {
    const res = await fetch("http://localhost:7544/ignore-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Failed to ignore issue: ${body}`);
    }
}
async function retrieveOrInitiateReport(args) {
    const res = await fetch("http://localhost:7544/reports/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
    });
    const body = (await res.json().catch(() => ({})));
    if (!res.ok) {
        if (body.needsUrl) {
            throw new ServerNeedsUrlError(body.error || "A running project URL is required to generate a fresh report.");
        }
        throw new Error(body.error || `Failed to retrieve report: ${res.status}`);
    }
    if (!body.report) {
        throw new Error("Server did not return a report payload.");
    }
    return {
        kind: "file",
        ...body.report,
    };
}
async function getReportById(reportId) {
    const res = await fetch(`http://localhost:7544/reports/${encodeURIComponent(reportId)}`);
    const body = (await res.json().catch(() => ({})));
    if (!res.ok || !body.report) {
        throw new Error(body.error || `Failed to fetch report ${reportId}`);
    }
    return {
        kind: "file",
        ...body.report,
    };
}
async function getProjectAuditSnapshot(rootPath) {
    const res = await fetch("http://localhost:7544/reports/project-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootPath }),
    });
    const body = (await res.json().catch(() => ({})));
    if (!res.ok) {
        throw new Error(body.error || `Failed to fetch project snapshot: ${res.status}`);
    }
    return {
        projectPath: body.projectPath || rootPath,
        projectName: body.projectName || path.basename(rootPath),
        createdAt: body.createdAt || new Date().toISOString(),
        files: body.files || [],
    };
}


/***/ },

/***/ "./src/webview/shared/issueUtils.ts"
/*!******************************************!*\
  !*** ./src/webview/shared/issueUtils.ts ***!
  \******************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.normalizeIssueText = normalizeIssueText;
exports.severityRank = severityRank;
exports.normalizeGuidelineLabel = normalizeGuidelineLabel;
exports.sanitizeIssueSnippet = sanitizeIssueSnippet;
exports.buildIssueMergeKey = buildIssueMergeKey;
exports.buildComponentGroupKey = buildComponentGroupKey;
exports.getComponentGroupLabel = getComponentGroupLabel;
exports.mergeIssues = mergeIssues;
function normalizeIssueText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
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
function normalizeGuidelineLabel(label) {
    const match = label.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : label.replace(/\s+/g, " ").trim();
}
function decodeHtmlEntities(value) {
    return value
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">");
}
function trimCommonIndentation(value) {
    const lines = value.replace(/\r\n/g, "\n").split("\n");
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    const minIndent = nonEmptyLines.reduce((smallest, line) => {
        const indent = line.match(/^\s*/)?.[0].length ?? 0;
        return Math.min(smallest, indent);
    }, Number.POSITIVE_INFINITY);
    if (!Number.isFinite(minIndent)) {
        return value.trim();
    }
    return lines
        .map((line) => line.slice(Math.min(minIndent, line.length)))
        .join("\n")
        .trim();
}
function extractPrimaryMarkupBlock(snippet) {
    const pairedPatterns = [
        /<([A-Za-z][\w:-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/,
        /<([A-Z][\w.]*)((?:\s[^>]*)?)>([\s\S]*?)<\/\1>/,
    ];
    for (const pattern of pairedPatterns) {
        const match = snippet.match(pattern);
        if (match?.[0]) {
            return trimCommonIndentation(match[0]);
        }
    }
    const selfClosingPatterns = [
        /<([A-Za-z][\w:-]*)(?:\s[^>]*)?\/>/,
        /<([A-Z][\w.]*)((?:\s[^>]*)?)\/>/,
    ];
    for (const pattern of selfClosingPatterns) {
        const match = snippet.match(pattern);
        if (match?.[0]) {
            return trimCommonIndentation(match[0]);
        }
    }
    return "";
}
function sanitizeIssueSnippet(value) {
    const raw = String(value || "").replace(/\r\n/g, "\n").trim();
    if (!raw)
        return "";
    const markupBlock = extractPrimaryMarkupBlock(raw);
    if (markupBlock) {
        return markupBlock;
    }
    const withoutTrailingCommentary = raw
        .replace(/\s+\((?:and|or|plus)\s+[^)]*\)\s*$/i, "")
        .replace(/\s+and\s+similar\s+[^\n]*$/i, "")
        .trim();
    return trimCommonIndentation(withoutTrailingCommentary);
}
function normalizeSnippetForKey(value) {
    return sanitizeIssueSnippet(value).replace(/\s+/g, " ").trim();
}
function compactIssueAnchor(value) {
    return normalizeSnippetForKey(value).slice(0, 160);
}
function extractQuotedAttribute(snippet, attribute) {
    const patterns = [
        new RegExp(`${attribute}\\s*=\\s*"([^"]+)"`, "i"),
        new RegExp(`${attribute}\\s*=\\s*'([^']+)'`, "i"),
        new RegExp(`${attribute}\\s*=\\s*\\{\\s*"([^"]+)"\\s*\\}`, "i"),
        new RegExp(`${attribute}\\s*=\\s*\\{\\s*'([^']+)'\\s*\\}`, "i"),
    ];
    for (const pattern of patterns) {
        const match = snippet.match(pattern);
        if (match?.[1]) {
            return normalizeIssueText(decodeHtmlEntities(match[1]));
        }
    }
    return "";
}
function stripTags(value) {
    return decodeHtmlEntities(value)
        .replace(/<[^>]+>/g, " ")
        .replace(/\{[^}]*\}/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function extractInnerTextFromSnippet(snippet) {
    const pairedTagMatch = snippet.match(/<([a-z0-9:-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/i);
    if (pairedTagMatch?.[2]) {
        return normalizeIssueText(stripTags(pairedTagMatch[2]));
    }
    return normalizeIssueText(stripTags(snippet));
}
function extractComponentText(issue) {
    const snippet = sanitizeIssueSnippet(issue.snippet);
    if (!snippet)
        return "";
    const attributeCandidates = [
        "aria-label",
        "alt",
        "title",
        "placeholder",
        "name",
        "label",
    ];
    for (const attribute of attributeCandidates) {
        const value = extractQuotedAttribute(snippet, attribute);
        if (value)
            return value;
    }
    const text = extractInnerTextFromSnippet(snippet);
    if (text)
        return text;
    return "";
}
function getLastSelectorNode(selector) {
    const normalized = normalizeIssueText(selector);
    if (!normalized)
        return "component";
    const segments = normalized.split(/\s+|>|\+|~/).filter(Boolean);
    const lastSegment = segments[segments.length - 1] || normalized;
    const cleaned = lastSegment
        .replace(/:{1,2}[a-z-]+\([^)]*\)/gi, "")
        .replace(/:{1,2}[a-z-]+/gi, "")
        .trim();
    const tagMatch = cleaned.match(/^[a-z][a-z0-9-]*/i);
    if (tagMatch)
        return tagMatch[0].toLowerCase();
    const roleLike = cleaned.match(/\.?([a-z][a-z0-9_-]*)/i);
    return roleLike?.[1]?.toLowerCase() || "component";
}
function buildIssueMergeKey(issue) {
    const selector = normalizeIssueText(issue.selector);
    const snippet = normalizeSnippetForKey(issue.snippet);
    return [
        issue.filePath,
        normalizeGuidelineLabel(issue.guideline),
        issue.source || "llm",
        issue.lineNumber ?? "",
        selector,
        snippet,
        normalizeIssueText(issue.issueDescription),
    ].join("|");
}
function buildComponentGroupKey(issue) {
    const selector = normalizeIssueText(issue.selector);
    const snippet = normalizeSnippetForKey(issue.snippet);
    const description = compactIssueAnchor(issue.issueDescription);
    if (issue.lineNumber !== undefined && issue.lineNumber !== null) {
        return [issue.filePath, issue.lineNumber, selector, snippet].join("|");
    }
    if (selector) {
        return [issue.filePath, selector, snippet].join("|");
    }
    return [issue.filePath, snippet, description].join("|");
}
function getComponentGroupLabel(issue) {
    const selector = normalizeIssueText(issue.selector);
    const nodeType = getLastSelectorNode(selector);
    const text = extractComponentText(issue);
    if (text) {
        return `${text} · ${nodeType}`;
    }
    if (selector) {
        return nodeType;
    }
    const snippet = compactIssueAnchor(issue.snippet);
    if (snippet)
        return `${snippet} · ${nodeType}`;
    if (issue.lineNumber !== undefined && issue.lineNumber !== null) {
        return `Component at line ${issue.lineNumber} · ${nodeType}`;
    }
    return "Component · component";
}
function mergeIssues(existing, incoming) {
    const preferIncoming = severityRank(incoming.severity) > severityRank(existing.severity);
    const primary = preferIncoming ? incoming : existing;
    const secondary = preferIncoming ? existing : incoming;
    return {
        ...secondary,
        ...primary,
        id: primary.id,
        ignored: existing.ignored || incoming.ignored,
        issueDescription: normalizeIssueText(primary.issueDescription) ||
            normalizeIssueText(secondary.issueDescription) ||
            undefined,
        selector: normalizeIssueText(primary.selector) ||
            normalizeIssueText(secondary.selector) ||
            undefined,
        snippet: sanitizeIssueSnippet(primary.snippet) ||
            sanitizeIssueSnippet(secondary.snippet) ||
            "",
        suggestion: normalizeIssueText(primary.suggestion) ||
            normalizeIssueText(secondary.suggestion) ||
            undefined,
        lineNumber: primary.lineNumber ?? secondary.lineNumber,
    };
}


/***/ },

/***/ "vscode"
/*!*************************!*\
  !*** external "vscode" ***!
  \*************************/
(module) {

module.exports = require("vscode");

/***/ },

/***/ "fs"
/*!*********************!*\
  !*** external "fs" ***!
  \*********************/
(module) {

module.exports = require("fs");

/***/ },

/***/ "path"
/*!***********************!*\
  !*** external "path" ***!
  \***********************/
(module) {

module.exports = require("path");

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		if (!(moduleId in __webpack_modules__)) {
/******/ 			delete __webpack_module_cache__[moduleId];
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__("./src/extension.ts");
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;
//# sourceMappingURL=extension.js.map