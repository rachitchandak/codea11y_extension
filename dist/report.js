/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/webview/report/FileList.tsx"
/*!*****************************************!*\
  !*** ./src/webview/report/FileList.tsx ***!
  \*****************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports["default"] = FileList;
const jsx_runtime_1 = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'react/jsx-runtime'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
/** Extract the filename from a full path. */
function baseName(filePath) {
    const parts = filePath.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || filePath;
}
function FileList({ files, selectedFile, onSelectFile, }) {
    return ((0, jsx_runtime_1.jsxs)("aside", { className: "w-[280px] shrink-0 border-r border-vscode-border flex flex-col h-full overflow-hidden", children: [(0, jsx_runtime_1.jsx)("div", { className: "px-3 py-2.5 border-b border-vscode-border", children: (0, jsx_runtime_1.jsx)("h2", { className: "text-xs uppercase tracking-wide font-semibold opacity-70 m-0", children: "Audited Files" }) }), (0, jsx_runtime_1.jsxs)("ul", { className: "flex-1 overflow-y-auto m-0 p-0 list-none", children: [files.length === 0 && ((0, jsx_runtime_1.jsx)("li", { className: "px-3 py-6 text-center text-xs opacity-40", children: "No files audited yet." })), files.map(({ filePath, issueCount }) => {
                        const isActive = filePath === selectedFile;
                        return ((0, jsx_runtime_1.jsx)("li", { children: (0, jsx_runtime_1.jsxs)("button", { className: `w-full text-left px-3 py-2 flex items-center justify-between gap-2
                  text-sm transition-colors cursor-pointer border-none outline-none
                  ${isActive
                                    ? "bg-vscode-list-hover font-medium"
                                    : "bg-transparent hover:bg-vscode-list-hover"}`, style: { color: "var(--vscode-editor-foreground)" }, onClick: () => onSelectFile(filePath), title: filePath, children: [(0, jsx_runtime_1.jsxs)("span", { className: "flex items-center gap-2 min-w-0", children: [(0, jsx_runtime_1.jsx)("span", { className: "codicon codicon-file text-xs opacity-60" }), (0, jsx_runtime_1.jsx)("span", { className: "truncate", children: baseName(filePath) })] }), issueCount > 0 && ((0, jsx_runtime_1.jsx)("span", { className: "shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium bg-vscode-badge-bg text-vscode-badge-fg", children: issueCount }))] }) }, filePath));
                    })] })] }));
}


/***/ },

/***/ "./src/webview/report/IssueCard.tsx"
/*!******************************************!*\
  !*** ./src/webview/report/IssueCard.tsx ***!
  \******************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports["default"] = IssueCard;
const jsx_runtime_1 = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'react/jsx-runtime'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
const react_1 = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'react'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
const issueUtils_1 = __webpack_require__(/*! ../shared/issueUtils */ "./src/webview/shared/issueUtils.ts");
const severityConfig = {
    error: {
        label: "Critical",
        className: "badge-error",
        icon: "codicon-error",
    },
    warning: {
        label: "Warning",
        className: "badge-warning",
        icon: "codicon-warning",
    },
    info: {
        label: "Info",
        className: "badge-info",
        icon: "codicon-info",
    },
};
function IssueCard({ group, onIgnore }) {
    const [open, setOpen] = (0, react_1.useState)(true);
    const visibleIssues = (0, react_1.useMemo)(() => group.issues.filter((issue) => !issue.ignored), [group.issues]);
    const issues = visibleIssues.length > 0 ? visibleIssues : group.issues;
    const highestSeverity = issues.reduce((current, issue) => (0, issueUtils_1.severityRank)(issue.severity) > (0, issueUtils_1.severityRank)(current) ? issue.severity : current, "info");
    const cfg = severityConfig[highestSeverity];
    const guidelineCount = visibleIssues.length > 0 ? visibleIssues.length : group.issues.length;
    const runtimeCount = issues.filter((issue) => issue.source === "runtime").length;
    return ((0, jsx_runtime_1.jsxs)("div", { className: `rounded-md border border-vscode-border mb-3 overflow-hidden transition-opacity ${visibleIssues.length === 0 ? "opacity-40" : ""}`, children: [(0, jsx_runtime_1.jsxs)("button", { className: "w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-vscode-input-bg border-b border-vscode-border text-left", onClick: () => setOpen((current) => !current), children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 min-w-0", children: [(0, jsx_runtime_1.jsxs)("span", { className: `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`, children: [(0, jsx_runtime_1.jsx)("span", { className: `codicon ${cfg.icon}` }), cfg.label] }), runtimeCount > 0 && ((0, jsx_runtime_1.jsx)("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-vscode-input-border bg-vscode-editorWidget-bg text-vscode-descriptionForeground", children: runtimeCount === guidelineCount ? "Runtime verified" : `${runtimeCount} runtime` })), (0, jsx_runtime_1.jsx)("span", { className: "text-sm font-semibold truncate", children: group.label })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3 shrink-0 pl-3", children: [(0, jsx_runtime_1.jsxs)("span", { className: "text-xs opacity-70", children: [guidelineCount, " guideline", guidelineCount === 1 ? "" : "s"] }), (0, jsx_runtime_1.jsx)("span", { className: `codicon ${open ? "codicon-chevron-up" : "codicon-chevron-down"}` })] })] }), open && ((0, jsx_runtime_1.jsxs)("div", { className: "px-4 py-3 space-y-3", children: [(group.lineNumber || group.selector) && ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3 text-xs opacity-50 pb-2 border-b border-vscode-border", children: [group.lineNumber && (0, jsx_runtime_1.jsxs)("span", { children: ["Line ", group.lineNumber] }), group.selector && ((0, jsx_runtime_1.jsx)("span", { className: "font-mono truncate", children: group.selector }))] })), issues.map((issue) => {
                        const issueCfg = severityConfig[issue.severity];
                        return ((0, jsx_runtime_1.jsxs)("section", { className: `rounded border border-vscode-border p-3 ${issue.ignored ? "opacity-40" : ""}`, children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-start justify-between gap-3 mb-3", children: [(0, jsx_runtime_1.jsxs)("div", { className: "min-w-0 flex items-center gap-2 flex-wrap", children: [(0, jsx_runtime_1.jsxs)("span", { className: `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${issueCfg.className}`, children: [(0, jsx_runtime_1.jsx)("span", { className: `codicon ${issueCfg.icon}` }), issueCfg.label] }), issue.source === "runtime" && ((0, jsx_runtime_1.jsx)("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-vscode-input-border bg-vscode-editorWidget-bg text-vscode-descriptionForeground", children: "Runtime verified" })), (0, jsx_runtime_1.jsx)("span", { className: "text-sm font-semibold truncate", children: (0, issueUtils_1.normalizeGuidelineLabel)(issue.guideline) })] }), (0, jsx_runtime_1.jsxs)("button", { className: "shrink-0 px-2.5 py-1 rounded text-xs font-medium\r\n                               border border-vscode-input-border\r\n                               hover:bg-vscode-list-hover transition-colors\r\n                               disabled:opacity-30", disabled: issue.ignored, onClick: () => onIgnore(issue.id), title: "Ignore this issue", children: [(0, jsx_runtime_1.jsx)("span", { className: "codicon codicon-eye-closed mr-1" }), "Ignore"] })] }), (0, jsx_runtime_1.jsxs)("div", { className: "space-y-3", children: [issue.issueDescription && ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h4", { className: "text-xs uppercase tracking-wide opacity-60 mb-1", children: "Description" }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm leading-relaxed", children: issue.issueDescription })] })), issue.snippet && ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h4", { className: "text-xs uppercase tracking-wide opacity-60 mb-1", children: "Code" }), (0, jsx_runtime_1.jsx)("pre", { className: "code-snippet text-xs", children: issue.snippet })] })), issue.suggestion && ((0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h4", { className: "text-xs uppercase tracking-wide opacity-60 mb-1", children: "How to Fix" }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm leading-relaxed", children: issue.suggestion })] }))] })] }, issue.id));
                    })] }))] }));
}


/***/ },

/***/ "./src/webview/report/ReportPanel.tsx"
/*!********************************************!*\
  !*** ./src/webview/report/ReportPanel.tsx ***!
  \********************************************/
(__unused_webpack_module, exports, __webpack_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports["default"] = ReportPanel;
const jsx_runtime_1 = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'react/jsx-runtime'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
const react_1 = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'react'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
const vscodeApi_1 = __webpack_require__(/*! ../shared/vscodeApi */ "./src/webview/shared/vscodeApi.ts");
const issueUtils_1 = __webpack_require__(/*! ../shared/issueUtils */ "./src/webview/shared/issueUtils.ts");
const FileList_1 = __importDefault(__webpack_require__(/*! ./FileList */ "./src/webview/report/FileList.tsx"));
const IssueCard_1 = __importDefault(__webpack_require__(/*! ./IssueCard */ "./src/webview/report/IssueCard.tsx"));
function computeFileReportState(results) {
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
    const groupedIssues = Array.from(groups.values()).map((group) => ({
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
    const fileEntries = Array.from(groupedIssues.reduce((map, group) => {
        const visibleIssues = group.issues.filter((issue) => !issue.ignored);
        if (visibleIssues.length > 0) {
            map.set(group.filePath, (map.get(group.filePath) || 0) + 1);
        }
        else if (!map.has(group.filePath)) {
            map.set(group.filePath, 0);
        }
        return map;
    }, new Map()), ([filePath, issueCount]) => ({ filePath, issueCount }));
    const counts = results.reduce((acc, result) => {
        if (!result.ignored) {
            acc[result.severity] += 1;
        }
        return acc;
    }, { error: 0, warning: 0, info: 0 });
    return { groupedIssues, fileEntries, counts };
}
function baseName(filePath) {
    const parts = filePath.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || filePath;
}
function SummaryBadge({ label, value }) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "rounded-xl border border-vscode-border bg-vscode-input-bg px-4 py-3", children: [(0, jsx_runtime_1.jsx)("div", { className: "text-[11px] uppercase tracking-wide opacity-60", children: label }), (0, jsx_runtime_1.jsx)("div", { className: "mt-1 text-xl font-semibold", children: value })] }));
}
function formatHash(fileHash) {
    if (!fileHash) {
        return "Not captured";
    }
    return fileHash.slice(0, 12);
}
function OverviewTable({ rows }) {
    if (rows.length === 0) {
        return (0, jsx_runtime_1.jsx)("p", { className: "text-sm opacity-60", children: "No audited files yet." });
    }
    return ((0, jsx_runtime_1.jsx)("div", { className: "overflow-hidden rounded-xl border border-vscode-border", children: (0, jsx_runtime_1.jsxs)("table", { className: "w-full border-collapse text-sm", children: [(0, jsx_runtime_1.jsx)("thead", { className: "bg-vscode-input-bg", children: (0, jsx_runtime_1.jsxs)("tr", { children: [(0, jsx_runtime_1.jsx)("th", { className: "px-3 py-2 text-left font-semibold", children: "File" }), (0, jsx_runtime_1.jsx)("th", { className: "px-3 py-2 text-left font-semibold", children: "Hash" }), (0, jsx_runtime_1.jsx)("th", { className: "px-3 py-2 text-left font-semibold", children: "Status" }), (0, jsx_runtime_1.jsx)("th", { className: "px-3 py-2 text-left font-semibold", children: "Score" }), (0, jsx_runtime_1.jsx)("th", { className: "px-3 py-2 text-left font-semibold", children: "Issues" })] }) }), (0, jsx_runtime_1.jsx)("tbody", { children: rows.map((row) => ((0, jsx_runtime_1.jsxs)("tr", { className: "border-t border-vscode-border", children: [(0, jsx_runtime_1.jsx)("td", { className: "px-3 py-2 font-mono text-xs", children: row.filePath }), (0, jsx_runtime_1.jsx)("td", { className: "px-3 py-2 font-mono text-xs", title: row.fileHash || "Hash unavailable", children: formatHash(row.fileHash) }), (0, jsx_runtime_1.jsx)("td", { className: "px-3 py-2 capitalize", children: row.scanStatus }), (0, jsx_runtime_1.jsx)("td", { className: "px-3 py-2", children: typeof row.accessibilityScore === "number"
                                    ? `${row.accessibilityScore}%`
                                    : "Not scored" }), (0, jsx_runtime_1.jsx)("td", { className: "px-3 py-2", children: row.issueCount })] }, row.filePath))) })] }) }));
}
function ProjectOverview({ report }) {
    return ((0, jsx_runtime_1.jsx)("div", { className: "h-full overflow-y-auto p-4", children: (0, jsx_runtime_1.jsxs)("div", { className: "space-y-6", children: [(0, jsx_runtime_1.jsxs)("section", { className: "grid gap-3 md:grid-cols-4", children: [(0, jsx_runtime_1.jsx)(SummaryBadge, { label: "Auditable Files", value: report.overview.totalAuditableFiles }), (0, jsx_runtime_1.jsx)(SummaryBadge, { label: "Audited Files", value: report.overview.auditedFileCount }), (0, jsx_runtime_1.jsx)(SummaryBadge, { label: "Not Audited", value: report.overview.unauditedFileCount }), (0, jsx_runtime_1.jsx)(SummaryBadge, { label: "Average Score", value: typeof report.overview.averageAccessibilityScore === "number"
                                ? `${report.overview.averageAccessibilityScore}%`
                                : "N/A" })] }), (0, jsx_runtime_1.jsxs)("section", { className: "space-y-3", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h2", { className: "m-0 text-sm font-semibold", children: "Audited files" }), (0, jsx_runtime_1.jsx)("p", { className: "mt-1 text-sm opacity-70", children: "Current accessibility score and issue count for each audited file." })] }), (0, jsx_runtime_1.jsx)(OverviewTable, { rows: report.overview.auditedFiles })] }), (0, jsx_runtime_1.jsxs)("section", { className: "space-y-3", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h2", { className: "m-0 text-sm font-semibold", children: "Files not yet audited" }), (0, jsx_runtime_1.jsx)("p", { className: "mt-1 text-sm opacity-70", children: "These auditable files are present in the workspace but do not have audit results yet." })] }), report.overview.unauditedFiles.length === 0 ? ((0, jsx_runtime_1.jsx)("div", { className: "rounded-xl border border-vscode-border bg-vscode-input-bg px-4 py-3 text-sm opacity-70", children: "All auditable files in this workspace have recorded audit results." })) : ((0, jsx_runtime_1.jsx)("div", { className: "rounded-xl border border-vscode-border bg-vscode-input-bg p-4", children: (0, jsx_runtime_1.jsx)("ul", { className: "m-0 list-none columns-1 gap-4 space-y-2 p-0 text-sm md:columns-2", children: report.overview.unauditedFiles.map((filePath) => ((0, jsx_runtime_1.jsx)("li", { className: "break-all font-mono text-xs", children: filePath }, filePath))) }) }))] })] }) }));
}
function ProjectFileView({ tab, onIgnore }) {
    return ((0, jsx_runtime_1.jsxs)("main", { className: "h-full overflow-y-auto p-4", children: [(0, jsx_runtime_1.jsxs)("div", { className: "mb-4 flex flex-wrap items-center gap-3", children: [(0, jsx_runtime_1.jsx)("h2", { className: "m-0 font-mono text-sm opacity-75", children: tab.filePath }), (0, jsx_runtime_1.jsxs)("span", { className: "rounded-full border border-vscode-border px-2 py-0.5 font-mono text-xs opacity-75", title: tab.fileHash || "Hash unavailable", children: ["hash ", formatHash(tab.fileHash)] }), (0, jsx_runtime_1.jsx)("span", { className: "rounded-full border border-vscode-border px-2 py-0.5 text-xs capitalize opacity-75", children: tab.scanStatus }), (0, jsx_runtime_1.jsx)("span", { className: "rounded-full border border-vscode-border px-2 py-0.5 text-xs opacity-75", children: typeof tab.accessibilityScore === "number"
                            ? `${tab.accessibilityScore}% accessibility`
                            : "No score" }), tab.runtimeAnalyzed && ((0, jsx_runtime_1.jsx)("span", { className: "rounded-full border border-vscode-border px-2 py-0.5 text-xs opacity-75", children: "Runtime analyzed" }))] }), tab.groupedIssues.length === 0 ? ((0, jsx_runtime_1.jsxs)("div", { className: "flex min-h-[280px] flex-col items-center justify-center opacity-50", children: [(0, jsx_runtime_1.jsx)("span", { className: "codicon codicon-pass mb-2 text-4xl" }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm", children: "No issues found for this file." })] })) : (tab.groupedIssues.map((group) => ((0, jsx_runtime_1.jsx)(IssueCard_1.default, { group: group, onIgnore: onIgnore }, group.key))))] }));
}
function FileReportView({ results, selectedFile, onSelectFile, onIgnore, }) {
    const { groupedIssues, fileEntries } = (0, react_1.useMemo)(() => computeFileReportState(results), [results]);
    const selectedGroups = (0, react_1.useMemo)(() => (selectedFile ? groupedIssues.filter((group) => group.filePath === selectedFile) : []), [groupedIssues, selectedFile]);
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex min-h-0 flex-1 overflow-hidden", children: [(0, jsx_runtime_1.jsx)(FileList_1.default, { files: fileEntries, selectedFile: selectedFile, onSelectFile: onSelectFile }), (0, jsx_runtime_1.jsx)("main", { className: "min-h-0 flex-1 overflow-y-auto", children: selectedFile === null ? ((0, jsx_runtime_1.jsxs)("div", { className: "flex h-full flex-col items-center justify-center opacity-50", children: [(0, jsx_runtime_1.jsx)("span", { className: "codicon codicon-checklist mb-2 text-4xl" }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm", children: "Select a file to view accessibility reports." })] })) : selectedGroups.length === 0 ? ((0, jsx_runtime_1.jsxs)("div", { className: "flex h-full flex-col items-center justify-center opacity-50", children: [(0, jsx_runtime_1.jsx)("span", { className: "codicon codicon-pass mb-2 text-4xl" }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm", children: "No issues found for this file." })] })) : ((0, jsx_runtime_1.jsxs)("div", { className: "p-4", children: [(0, jsx_runtime_1.jsx)("h2", { className: "mb-3 text-sm font-mono font-medium opacity-70", children: selectedFile }), selectedGroups.map((group) => ((0, jsx_runtime_1.jsx)(IssueCard_1.default, { group: group, onIgnore: onIgnore }, group.key)))] })) })] }));
}
function ReportPanel() {
    const vscodeApi = (0, vscodeApi_1.getVsCodeApi)();
    const [results, setResults] = (0, react_1.useState)([]);
    const [selectedFile, setSelectedFile] = (0, react_1.useState)(null);
    const [fileReportMeta, setFileReportMeta] = (0, react_1.useState)(null);
    const [projectReport, setProjectReport] = (0, react_1.useState)(null);
    const [selectedTab, setSelectedTab] = (0, react_1.useState)("overview");
    const [downloadState, setDownloadState] = (0, react_1.useState)({ status: "idle" });
    (0, react_1.useEffect)(() => {
        vscodeApi.postMessage({ type: "WEBVIEW_READY", payload: undefined });
        return (0, vscodeApi_1.onExtensionMessage)((msg) => {
            switch (msg.type) {
                case "RESET_REPORT":
                    setResults([]);
                    setSelectedFile(null);
                    setFileReportMeta(null);
                    setProjectReport(null);
                    setSelectedTab("overview");
                    break;
                case "REPORT_READY": {
                    const payload = msg.payload;
                    if (payload.kind === "project") {
                        setProjectReport(payload);
                        setFileReportMeta(null);
                        setResults([]);
                        setSelectedFile(null);
                        setSelectedTab("overview");
                        break;
                    }
                    const nextResults = payload.results.map((issue) => ({
                        ...issue,
                        guideline: (0, issueUtils_1.normalizeGuidelineLabel)(issue.guideline),
                        snippet: (0, issueUtils_1.sanitizeIssueSnippet)(issue.snippet),
                    }));
                    setProjectReport(null);
                    setFileReportMeta(payload);
                    setResults(nextResults);
                    setSelectedFile(payload.filePath);
                    break;
                }
                case "NEW_AUDIT_RESULT":
                    setResults((prev) => {
                        const next = {
                            ...msg.payload,
                            guideline: (0, issueUtils_1.normalizeGuidelineLabel)(msg.payload.guideline),
                            snippet: (0, issueUtils_1.sanitizeIssueSnippet)(msg.payload.snippet),
                        };
                        const mergeKey = (0, issueUtils_1.buildIssueMergeKey)(next);
                        const existingIndex = prev.findIndex((issue) => (0, issueUtils_1.buildIssueMergeKey)(issue) === mergeKey);
                        if (existingIndex === -1) {
                            return [...prev, next];
                        }
                        const merged = (0, issueUtils_1.mergeIssues)(prev[existingIndex], next);
                        return prev.map((issue, index) => (index === existingIndex ? merged : issue));
                    });
                    break;
                case "REPORT_DOWNLOAD_STATUS":
                    setDownloadState({
                        status: msg.payload.status,
                        message: msg.payload.message,
                    });
                    break;
            }
        });
    }, [vscodeApi]);
    (0, react_1.useEffect)(() => {
        if (downloadState.status === "idle" ||
            downloadState.status === "preparing" ||
            downloadState.status === "choosing-location") {
            return;
        }
        const timeoutId = window.setTimeout(() => {
            setDownloadState({ status: "idle" });
        }, 2500);
        return () => window.clearTimeout(timeoutId);
    }, [downloadState]);
    (0, react_1.useEffect)(() => {
        if (projectReport || selectedFile !== null || results.length === 0) {
            return;
        }
        setSelectedFile(results[0].filePath);
    }, [projectReport, results, selectedFile]);
    const singleFileDerived = (0, react_1.useMemo)(() => computeFileReportState(results), [results]);
    const aggregateCounts = (0, react_1.useMemo)(() => {
        if (!projectReport) {
            return singleFileDerived.counts;
        }
        return projectReport.fileTabs.reduce((acc, tab) => {
            acc.error += tab.counts.error;
            acc.warning += tab.counts.warning;
            acc.info += tab.counts.info;
            return acc;
        }, { error: 0, warning: 0, info: 0 });
    }, [projectReport, singleFileDerived.counts]);
    const downloadPayload = (0, react_1.useMemo)(() => {
        if (projectReport) {
            return {
                results: projectReport.fileTabs.flatMap((tab) => tab.results),
                groupedIssues: projectReport.fileTabs.flatMap((tab) => tab.groupedIssues),
                fileEntries: projectReport.fileTabs.map((tab) => ({
                    filePath: tab.filePath,
                    issueCount: tab.issueCount,
                })),
                counts: aggregateCounts,
                suggestedFileName: `codea11y-project-report-${new Date().toISOString().slice(0, 10)}.html`,
            };
        }
        return {
            results,
            groupedIssues: singleFileDerived.groupedIssues,
            fileEntries: singleFileDerived.fileEntries,
            counts: singleFileDerived.counts,
            suggestedFileName: `codea11y-report-${new Date().toISOString().slice(0, 10)}.html`,
        };
    }, [aggregateCounts, projectReport, results, singleFileDerived]);
    const handleIgnore = (0, react_1.useCallback)((issueId) => {
        if (projectReport) {
            setProjectReport((prev) => {
                if (!prev) {
                    return prev;
                }
                const nextFileTabs = prev.fileTabs.map((tab) => {
                    const nextResults = tab.results.map((issue) => issue.id === issueId ? { ...issue, ignored: true } : issue);
                    const issueCount = nextResults.filter((issue) => !issue.ignored).length;
                    const counts = nextResults.reduce((acc, issue) => {
                        if (!issue.ignored) {
                            acc[issue.severity] += 1;
                        }
                        return acc;
                    }, { error: 0, warning: 0, info: 0 });
                    return {
                        ...tab,
                        issueCount,
                        results: nextResults,
                        groupedIssues: tab.groupedIssues.map((group) => ({
                            ...group,
                            issues: group.issues.map((issue) => issue.id === issueId ? { ...issue, ignored: true } : issue),
                        })),
                        fileEntries: [{ filePath: tab.filePath, issueCount }],
                        counts,
                    };
                });
                return {
                    ...prev,
                    overview: {
                        ...prev.overview,
                        auditedFiles: prev.overview.auditedFiles.map((file) => {
                            const nextTab = nextFileTabs.find((tab) => tab.filePath === file.filePath);
                            return nextTab ? { ...file, issueCount: nextTab.issueCount } : file;
                        }),
                    },
                    fileTabs: nextFileTabs,
                };
            });
        }
        else {
            setResults((prev) => prev.map((result) => (result.id === issueId ? { ...result, ignored: true } : result)));
        }
        vscodeApi.postMessage({
            type: "IGNORE_ISSUE",
            payload: { issueId },
        });
    }, [projectReport, vscodeApi]);
    const handleDownloadReport = (0, react_1.useCallback)(() => {
        setDownloadState({
            status: "preparing",
            message: "Preparing HTML report...",
        });
        vscodeApi.postMessage({
            type: "DOWNLOAD_REPORT",
            payload: downloadPayload,
        });
    }, [downloadPayload, vscodeApi]);
    const isDownloadBusy = downloadState.status === "preparing" || downloadState.status === "choosing-location";
    const downloadButtonLabel = downloadState.status === "preparing"
        ? "Preparing..."
        : downloadState.status === "choosing-location"
            ? "Choose Save Location..."
            : downloadState.status === "saved"
                ? "Report Saved"
                : downloadState.status === "cancelled"
                    ? "Download Cancelled"
                    : downloadState.status === "error"
                        ? "Download Failed"
                        : "Download Report";
    const downloadButtonIcon = downloadState.status === "saved"
        ? "codicon-check"
        : downloadState.status === "error"
            ? "codicon-error"
            : downloadState.status === "cancelled"
                ? "codicon-close"
                : isDownloadBusy
                    ? "codicon-loading codicon-modifier-spin"
                    : "codicon-cloud-download";
    const selectedProjectTab = (0, react_1.useMemo)(() => {
        if (!projectReport || selectedTab === "overview") {
            return null;
        }
        return projectReport.fileTabs.find((tab) => tab.filePath === selectedTab) || null;
    }, [projectReport, selectedTab]);
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex h-full min-h-0 flex-col overflow-hidden", children: [(0, jsx_runtime_1.jsxs)("header", { className: "flex shrink-0 items-center justify-between border-b border-vscode-border px-4 py-3", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [(0, jsx_runtime_1.jsx)("h1", { className: "m-0 text-base font-semibold", children: projectReport ? `${projectReport.projectName} Reports` : "Audit Report" }), (0, jsx_runtime_1.jsx)("span", { className: "text-xs opacity-60", children: projectReport
                                    ? `${projectReport.overview.auditedFileCount}/${projectReport.overview.totalAuditableFiles} files audited`
                                    : `${results.filter((result) => !result.ignored).length} issues` })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-3", children: [(0, jsx_runtime_1.jsxs)("span", { className: "badge-error inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", children: [aggregateCounts.error, " errors"] }), (0, jsx_runtime_1.jsxs)("span", { className: "badge-warning inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", children: [aggregateCounts.warning, " warnings"] }), (0, jsx_runtime_1.jsxs)("span", { className: "badge-info inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", children: [aggregateCounts.info, " info"] }), (0, jsx_runtime_1.jsxs)("button", { className: "rounded bg-vscode-button-bg px-3 py-1 text-xs font-medium text-vscode-button-fg transition-colors hover:bg-vscode-button-hover disabled:cursor-not-allowed disabled:opacity-60", onClick: handleDownloadReport, disabled: isDownloadBusy, title: downloadState.message || "Download the current report as HTML", children: [(0, jsx_runtime_1.jsx)("span", { className: `codicon ${downloadButtonIcon} mr-1` }), downloadButtonLabel] })] })] }), projectReport ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex shrink-0 gap-2 overflow-x-auto border-b border-vscode-border px-3 py-2", children: [(0, jsx_runtime_1.jsx)("button", { className: `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${selectedTab === "overview"
                                    ? "bg-vscode-button-bg text-vscode-button-fg"
                                    : "border border-vscode-border hover:bg-vscode-list-hover"}`, onClick: () => setSelectedTab("overview"), children: "Overview" }), projectReport.fileTabs.map((tab) => ((0, jsx_runtime_1.jsxs)("button", { className: `flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${selectedTab === tab.filePath
                                    ? "bg-vscode-button-bg text-vscode-button-fg"
                                    : "border border-vscode-border hover:bg-vscode-list-hover"}`, onClick: () => setSelectedTab(tab.filePath), title: tab.filePath, children: [(0, jsx_runtime_1.jsx)("span", { children: baseName(tab.filePath) }), (0, jsx_runtime_1.jsx)("span", { className: "rounded-full bg-vscode-badge-bg px-1.5 py-0.5 text-[11px] text-vscode-badge-fg", children: tab.issueCount })] }, tab.filePath)))] }), (0, jsx_runtime_1.jsx)("div", { className: "min-h-0 flex-1 overflow-hidden", children: selectedTab === "overview" || !selectedProjectTab ? ((0, jsx_runtime_1.jsx)(ProjectOverview, { report: projectReport })) : ((0, jsx_runtime_1.jsx)(ProjectFileView, { tab: selectedProjectTab, onIgnore: handleIgnore })) })] })) : ((0, jsx_runtime_1.jsx)(FileReportView, { results: results, selectedFile: selectedFile, onSelectFile: setSelectedFile, onIgnore: handleIgnore }))] }));
}


/***/ },

/***/ "./src/webview/report/index.tsx"
/*!**************************************!*\
  !*** ./src/webview/report/index.tsx ***!
  \**************************************/
(__unused_webpack_module, exports, __webpack_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
const jsx_runtime_1 = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'react/jsx-runtime'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
const client_1 = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'react-dom/client'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
const ReportPanel_1 = __importDefault(__webpack_require__(/*! ./ReportPanel */ "./src/webview/report/ReportPanel.tsx"));
__webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '../shared/globals.css'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
const container = document.getElementById("root");
const root = (0, client_1.createRoot)(container);
root.render((0, jsx_runtime_1.jsx)(ReportPanel_1.default, {}));


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

/***/ "./src/webview/shared/vscodeApi.ts"
/*!*****************************************!*\
  !*** ./src/webview/shared/vscodeApi.ts ***!
  \*****************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getVsCodeApi = getVsCodeApi;
exports.onExtensionMessage = onExtensionMessage;
// Singleton
let _api;
function getVsCodeApi() {
    if (!_api) {
        _api = acquireVsCodeApi();
    }
    return _api;
}
/**
 * Subscribe to messages coming FROM the extension host.
 * Returns an unsubscribe function.
 */
function onExtensionMessage(handler) {
    const listener = (event) => {
        handler(event.data);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
}


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
/******/ 	var __webpack_exports__ = __webpack_require__("./src/webview/report/index.tsx");
/******/ 	
/******/ })()
;
//# sourceMappingURL=report.js.map