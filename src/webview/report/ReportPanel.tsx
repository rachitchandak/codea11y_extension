import React, { useState, useEffect, useCallback, useMemo } from "react";
import type {
  AuditResult,
  Severity,
  ExtensionToWebviewMessage,
} from "../../shared/messages";
import { getVsCodeApi, onExtensionMessage } from "../shared/vscodeApi";
import FileList from "./FileList";
import IssueCard from "./IssueCard";

function normalizeGuidelineLabel(label: string): string {
  const match = label.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : label.replace(/\s+/g, " ").trim();
}

function normalizeIssueText(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function severityRank(severity: Severity): number {
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

function buildIssueMergeKey(issue: AuditResult): string {
  const selector = normalizeIssueText(issue.selector);
  const hasLocation = issue.lineNumber !== undefined || Boolean(selector);

  return [
    issue.filePath,
    normalizeGuidelineLabel(issue.guideline),
    issue.source || "llm",
    hasLocation
      ? `${issue.lineNumber ?? ""}|${selector}`
      : `${normalizeIssueText(issue.snippet)}|${normalizeIssueText(issue.issueDescription)}`,
  ].join("|");
}

function mergeIssues(existing: AuditResult, incoming: AuditResult): AuditResult {
  const preferIncoming = severityRank(incoming.severity) > severityRank(existing.severity);
  const primary = preferIncoming ? incoming : existing;
  const secondary = preferIncoming ? existing : incoming;

  return {
    ...secondary,
    ...primary,
    id: primary.id,
    ignored: existing.ignored || incoming.ignored,
    issueDescription:
      normalizeIssueText(primary.issueDescription) ||
      normalizeIssueText(secondary.issueDescription) ||
      undefined,
    selector:
      normalizeIssueText(primary.selector) ||
      normalizeIssueText(secondary.selector) ||
      undefined,
    snippet:
      normalizeIssueText(primary.snippet) ||
      normalizeIssueText(secondary.snippet) ||
      "",
    suggestion:
      normalizeIssueText(primary.suggestion) ||
      normalizeIssueText(secondary.suggestion) ||
      undefined,
    lineNumber: primary.lineNumber ?? secondary.lineNumber,
  };
}

/* ===================================================================
 *  Progress bar (internal)
 * =================================================================== */

function ProgressBar({
  percent,
  label,
}: {
  percent: number;
  label: string;
}) {
  if (percent <= 0) return null;

  return (
    <div className="px-4 py-3 border-b border-vscode-border">
      <div className="flex items-center justify-between text-sm mb-1">
        <span>{label}</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div className="h-1.5 w-full rounded bg-vscode-input-bg overflow-hidden">
        <div
          className="h-full bg-vscode-button-bg transition-all duration-300"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

/* ===================================================================
 *  ReportPanel — Master-Detail layout
 * =================================================================== */

export default function ReportPanel() {
  const vscodeApi = getVsCodeApi();

  const [results, setResults] = useState<AuditResult[]>([]);
  const [progress, setProgress] = useState({ percent: 0, label: "" });
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // ── Listen for extension messages ─────────────────────────────
  useEffect(() => {
    vscodeApi.postMessage({ type: "REPORT_READY", payload: undefined });

    return onExtensionMessage((msg: ExtensionToWebviewMessage) => {
      switch (msg.type) {
        case "RESET_REPORT":
          setResults([]);
          setProgress({ percent: 0, label: "" });
          setSelectedFile(null);
          break;
        case "NEW_AUDIT_RESULT":
          setResults((prev) => {
            const next = {
              ...msg.payload,
              guideline: normalizeGuidelineLabel(msg.payload.guideline),
            };
            const mergeKey = buildIssueMergeKey(next);
            const existingIndex = prev.findIndex(
              (issue) => buildIssueMergeKey(issue) === mergeKey
            );

            if (existingIndex === -1) {
              return [...prev, next];
            }

            const merged = mergeIssues(prev[existingIndex], next);
            return prev.map((issue, index) =>
              index === existingIndex ? merged : issue
            );
          });
          break;
        case "SET_PROGRESS":
          setProgress(msg.payload);
          break;
      }
    });
  }, []);

  // Auto-select first file when results arrive and nothing is selected
  useEffect(() => {
    if (selectedFile === null && results.length > 0) {
      setSelectedFile(results[0].filePath);
    }
  }, [results, selectedFile]);

  // ── Derived data ──────────────────────────────────────────────

  /** Unique file list with issue counts (non-ignored). */
  const fileEntries = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of results) {
      if (!r.ignored) {
        map.set(r.filePath, (map.get(r.filePath) || 0) + 1);
      } else {
        // ensure file still appears even if all issues ignored
        if (!map.has(r.filePath)) map.set(r.filePath, 0);
      }
    }
    return Array.from(map, ([filePath, issueCount]) => ({
      filePath,
      issueCount,
    }));
  }, [results]);

  /** Issues for the selected file. */
  const selectedIssues = useMemo(
    () => (selectedFile ? results.filter((r) => r.filePath === selectedFile) : []),
    [results, selectedFile]
  );

  /** Global severity counts (non-ignored). */
  const counts = useMemo(
    () =>
      results.reduce(
        (acc, r) => {
          if (!r.ignored) acc[r.severity]++;
          return acc;
        },
        { error: 0, warning: 0, info: 0 } as Record<Severity, number>
      ),
    [results]
  );

  // ── Handlers ──────────────────────────────────────────────────

  const handleIgnore = useCallback(
    (issueId: string) => {
      setResults((prev) =>
        prev.map((r) => (r.id === issueId ? { ...r, ignored: true } : r))
      );
      vscodeApi.postMessage({
        type: "IGNORE_ISSUE",
        payload: { issueId },
      });
    },
    [vscodeApi]
  );

  const handleRetry = useCallback(() => {
    setResults([]);
    setSelectedFile(null);
    setProgress({ percent: 0, label: "" });
    vscodeApi.postMessage({ type: "RETRY_AUDIT", payload: undefined });
  }, [vscodeApi]);

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-vscode-border shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold m-0">Audit Report</h1>
          <span className="text-xs opacity-60">
            {results.filter((r) => !r.ignored).length} issues
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="badge-error inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs">
            {counts.error} errors
          </span>
          <span className="badge-warning inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs">
            {counts.warning} warnings
          </span>
          <span className="badge-info inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs">
            {counts.info} info
          </span>

          <button
            className="px-3 py-1 rounded text-xs font-medium
                       bg-vscode-button-bg text-vscode-button-fg
                       hover:bg-vscode-button-hover transition-colors"
            onClick={handleRetry}
          >
            <span className="codicon codicon-refresh mr-1" />
            Re-run Audit
          </button>
        </div>
      </header>

      {/* ── Progress ────────────────────────────────────────────── */}
      <ProgressBar percent={progress.percent} label={progress.label} />

      {/* ── Master-Detail body ──────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column — File list */}
        <FileList
          files={fileEntries}
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
        />

        {/* Right column — Issue detail */}
        <main className="flex-1 overflow-y-auto">
          {selectedFile === null ? (
            <div className="flex flex-col items-center justify-center h-full opacity-50">
              <span className="codicon codicon-checklist text-4xl mb-2" />
              <p className="text-sm">
                Select a file to view accessibility reports.
              </p>
            </div>
          ) : selectedIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full opacity-50">
              <span className="codicon codicon-pass text-4xl mb-2" />
              <p className="text-sm">No issues found for this file.</p>
            </div>
          ) : (
            <div className="p-4">
              <h2 className="text-sm font-mono font-medium opacity-70 mb-3 truncate">
                {selectedFile}
              </h2>
              {selectedIssues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  onIgnore={handleIgnore}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
