import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AuditResult,
  ExtensionToWebviewMessage,
  FileReportReadyPayload,
  ProjectReportFileTab,
  ProjectReportReadyPayload,
  ReportDownloadPayload,
  ReportFileEntry,
  ReportIssueGroup,
  ReportReadyPayload,
  Severity,
} from "../../shared/messages";
import { getVsCodeApi, onExtensionMessage } from "../shared/vscodeApi";
import {
  buildComponentGroupKey,
  buildIssueMergeKey,
  getComponentGroupLabel,
  mergeIssues,
  normalizeGuidelineLabel,
  sanitizeIssueSnippet,
  severityRank,
} from "../shared/issueUtils";
import FileList from "./FileList";
import IssueCard from "./IssueCard";

type IssueGroup = ReportIssueGroup;

function computeFileReportState(results: AuditResult[]): {
  groupedIssues: ReportIssueGroup[];
  fileEntries: ReportFileEntry[];
  counts: Record<Severity, number>;
} {
  const mergedResults = new Map<string, AuditResult>();

  for (const issue of results) {
    const mergeKey = buildIssueMergeKey(issue);
    const existing = mergedResults.get(mergeKey);
    mergedResults.set(mergeKey, existing ? mergeIssues(existing, issue) : issue);
  }

  const groups = new Map<string, IssueGroup>();
  for (const issue of mergedResults.values()) {
    const key = buildComponentGroupKey(issue);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        filePath: issue.filePath,
        lineNumber: issue.lineNumber,
        selector: issue.selector,
        label: getComponentGroupLabel(issue),
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
      const severityDiff = severityRank(right.severity) - severityRank(left.severity);
      if (severityDiff !== 0) return severityDiff;
      const guidelineDiff = normalizeGuidelineLabel(left.guideline).localeCompare(
        normalizeGuidelineLabel(right.guideline)
      );
      if (guidelineDiff !== 0) return guidelineDiff;
      return String(left.id).localeCompare(String(right.id));
    }),
  }));

  const fileEntries = Array.from(
    groupedIssues.reduce((map, group) => {
      const visibleIssues = group.issues.filter((issue) => !issue.ignored);
      if (visibleIssues.length > 0) {
        map.set(group.filePath, (map.get(group.filePath) || 0) + 1);
      } else if (!map.has(group.filePath)) {
        map.set(group.filePath, 0);
      }
      return map;
    }, new Map<string, number>()),
    ([filePath, issueCount]) => ({ filePath, issueCount })
  );

  const counts = results.reduce(
    (acc, result) => {
      if (!result.ignored) {
        acc[result.severity] += 1;
      }
      return acc;
    },
    { error: 0, warning: 0, info: 0 } as Record<Severity, number>
  );

  return { groupedIssues, fileEntries, counts };
}

function baseName(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || filePath;
}

function SummaryBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-vscode-border bg-vscode-input-bg px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide opacity-60">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function formatHash(fileHash: string | null | undefined): string {
  if (!fileHash) {
    return "Not captured";
  }

  return fileHash.slice(0, 12);
}

function OverviewTable({ rows }: { rows: ProjectReportReadyPayload["overview"]["auditedFiles"] }) {
  if (rows.length === 0) {
    return <p className="text-sm opacity-60">No audited files yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-vscode-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-vscode-input-bg">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">File</th>
            <th className="px-3 py-2 text-left font-semibold">Hash</th>
            <th className="px-3 py-2 text-left font-semibold">Status</th>
            <th className="px-3 py-2 text-left font-semibold">Score</th>
            <th className="px-3 py-2 text-left font-semibold">Issues</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.filePath} className="border-t border-vscode-border">
              <td className="px-3 py-2 font-mono text-xs">{row.filePath}</td>
              <td className="px-3 py-2 font-mono text-xs" title={row.fileHash || "Hash unavailable"}>
                {formatHash(row.fileHash)}
              </td>
              <td className="px-3 py-2 capitalize">{row.scanStatus}</td>
              <td className="px-3 py-2">
                {typeof row.accessibilityScore === "number"
                  ? `${row.accessibilityScore}%`
                  : "Not scored"}
              </td>
              <td className="px-3 py-2">{row.issueCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectOverview({ report }: { report: ProjectReportReadyPayload }) {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-4">
        <SummaryBadge label="Auditable Files" value={report.overview.totalAuditableFiles} />
        <SummaryBadge label="Audited Files" value={report.overview.auditedFileCount} />
        <SummaryBadge label="Not Audited" value={report.overview.unauditedFileCount} />
        <SummaryBadge
          label="Average Score"
          value={
            typeof report.overview.averageAccessibilityScore === "number"
              ? `${report.overview.averageAccessibilityScore}%`
              : "N/A"
          }
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="m-0 text-sm font-semibold">Audited files</h2>
          <p className="mt-1 text-sm opacity-70">
            Current accessibility score and issue count for each audited file.
          </p>
        </div>
        <OverviewTable rows={report.overview.auditedFiles} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="m-0 text-sm font-semibold">Files not yet audited</h2>
          <p className="mt-1 text-sm opacity-70">
            These auditable files are present in the workspace but do not have audit results yet.
          </p>
        </div>
        {report.overview.unauditedFiles.length === 0 ? (
          <div className="rounded-xl border border-vscode-border bg-vscode-input-bg px-4 py-3 text-sm opacity-70">
            All auditable files in this workspace have recorded audit results.
          </div>
        ) : (
          <div className="rounded-xl border border-vscode-border bg-vscode-input-bg p-4">
            <ul className="m-0 list-none columns-1 gap-4 space-y-2 p-0 text-sm md:columns-2">
              {report.overview.unauditedFiles.map((filePath) => (
                <li key={filePath} className="break-all font-mono text-xs">
                  {filePath}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

function ProjectFileView({ tab, onIgnore }: { tab: ProjectReportFileTab; onIgnore: (id: string) => void }) {
  return (
    <main className="h-full overflow-y-auto p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="m-0 font-mono text-sm opacity-75">{tab.filePath}</h2>
        <span
          className="rounded-full border border-vscode-border px-2 py-0.5 font-mono text-xs opacity-75"
          title={tab.fileHash || "Hash unavailable"}
        >
          hash {formatHash(tab.fileHash)}
        </span>
        <span className="rounded-full border border-vscode-border px-2 py-0.5 text-xs capitalize opacity-75">
          {tab.scanStatus}
        </span>
        <span className="rounded-full border border-vscode-border px-2 py-0.5 text-xs opacity-75">
          {typeof tab.accessibilityScore === "number"
            ? `${tab.accessibilityScore}% accessibility`
            : "No score"}
        </span>
        {tab.runtimeAnalyzed && (
          <span className="rounded-full border border-vscode-border px-2 py-0.5 text-xs opacity-75">
            Runtime analyzed
          </span>
        )}
      </div>

      {tab.groupedIssues.length === 0 ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center opacity-50">
          <span className="codicon codicon-pass mb-2 text-4xl" />
          <p className="text-sm">No issues found for this file.</p>
        </div>
      ) : (
        tab.groupedIssues.map((group) => (
          <IssueCard key={group.key} group={group} onIgnore={onIgnore} />
        ))
      )}
    </main>
  );
}

function FileReportView({
  results,
  selectedFile,
  onSelectFile,
  onIgnore,
}: {
  results: AuditResult[];
  selectedFile: string | null;
  onSelectFile: (filePath: string | null) => void;
  onIgnore: (id: string) => void;
}) {
  const { groupedIssues, fileEntries } = useMemo(() => computeFileReportState(results), [results]);
  const selectedGroups = useMemo(
    () => (selectedFile ? groupedIssues.filter((group) => group.filePath === selectedFile) : []),
    [groupedIssues, selectedFile]
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <FileList files={fileEntries} selectedFile={selectedFile} onSelectFile={onSelectFile} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        {selectedFile === null ? (
          <div className="flex h-full flex-col items-center justify-center opacity-50">
            <span className="codicon codicon-checklist mb-2 text-4xl" />
            <p className="text-sm">Select a file to view accessibility reports.</p>
          </div>
        ) : selectedGroups.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center opacity-50">
            <span className="codicon codicon-pass mb-2 text-4xl" />
            <p className="text-sm">No issues found for this file.</p>
          </div>
        ) : (
          <div className="p-4">
            <h2 className="mb-3 text-sm font-mono font-medium opacity-70">{selectedFile}</h2>
            {selectedGroups.map((group) => (
              <IssueCard key={group.key} group={group} onIgnore={onIgnore} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ReportPanel() {
  const vscodeApi = getVsCodeApi();

  const [results, setResults] = useState<AuditResult[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileReportMeta, setFileReportMeta] = useState<FileReportReadyPayload | null>(null);
  const [projectReport, setProjectReport] = useState<ProjectReportReadyPayload | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>("overview");
  const [downloadState, setDownloadState] = useState<{
    status: "idle" | "preparing" | "choosing-location" | "saved" | "cancelled" | "error";
    message?: string;
  }>({ status: "idle" });

  useEffect(() => {
    vscodeApi.postMessage({ type: "WEBVIEW_READY", payload: undefined });

    return onExtensionMessage((msg: ExtensionToWebviewMessage) => {
      switch (msg.type) {
        case "RESET_REPORT":
          setResults([]);
          setSelectedFile(null);
          setFileReportMeta(null);
          setProjectReport(null);
          setSelectedTab("overview");
          break;
        case "REPORT_READY": {
          const payload = msg.payload as ReportReadyPayload;

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
            guideline: normalizeGuidelineLabel(issue.guideline),
            snippet: sanitizeIssueSnippet(issue.snippet),
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
              guideline: normalizeGuidelineLabel(msg.payload.guideline),
              snippet: sanitizeIssueSnippet(msg.payload.snippet),
            };
            const mergeKey = buildIssueMergeKey(next);
            const existingIndex = prev.findIndex((issue) => buildIssueMergeKey(issue) === mergeKey);

            if (existingIndex === -1) {
              return [...prev, next];
            }

            const merged = mergeIssues(prev[existingIndex], next);
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

  useEffect(() => {
    if (
      downloadState.status === "idle" ||
      downloadState.status === "preparing" ||
      downloadState.status === "choosing-location"
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDownloadState({ status: "idle" });
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [downloadState]);

  useEffect(() => {
    if (projectReport || selectedFile !== null || results.length === 0) {
      return;
    }

    setSelectedFile(results[0].filePath);
  }, [projectReport, results, selectedFile]);

  const singleFileDerived = useMemo(() => computeFileReportState(results), [results]);

  const aggregateCounts = useMemo(() => {
    if (!projectReport) {
      return singleFileDerived.counts;
    }

    return projectReport.fileTabs.reduce(
      (acc, tab) => {
        acc.error += tab.counts.error;
        acc.warning += tab.counts.warning;
        acc.info += tab.counts.info;
        return acc;
      },
      { error: 0, warning: 0, info: 0 }
    );
  }, [projectReport, singleFileDerived.counts]);

  const downloadPayload = useMemo<ReportDownloadPayload>(() => {
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

  const handleIgnore = useCallback(
    (issueId: string) => {
      if (projectReport) {
        setProjectReport((prev) => {
          if (!prev) {
            return prev;
          }

          const nextFileTabs = prev.fileTabs.map((tab) => {
            const nextResults = tab.results.map((issue) =>
              issue.id === issueId ? { ...issue, ignored: true } : issue
            );
            const issueCount = nextResults.filter((issue) => !issue.ignored).length;
            const counts = nextResults.reduce(
              (acc, issue) => {
                if (!issue.ignored) {
                  acc[issue.severity] += 1;
                }
                return acc;
              },
              { error: 0, warning: 0, info: 0 } as Record<Severity, number>
            );

            return {
              ...tab,
              issueCount,
              results: nextResults,
              groupedIssues: tab.groupedIssues.map((group) => ({
                ...group,
                issues: group.issues.map((issue) =>
                  issue.id === issueId ? { ...issue, ignored: true } : issue
                ),
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
      } else {
        setResults((prev) => prev.map((result) => (result.id === issueId ? { ...result, ignored: true } : result)));
      }

      vscodeApi.postMessage({
        type: "IGNORE_ISSUE",
        payload: { issueId },
      });
    },
    [projectReport, vscodeApi]
  );

  const handleDownloadReport = useCallback(() => {
    setDownloadState({
      status: "preparing",
      message: "Preparing HTML report...",
    });

    vscodeApi.postMessage({
      type: "DOWNLOAD_REPORT",
      payload: downloadPayload,
    });
  }, [downloadPayload, vscodeApi]);

  const isDownloadBusy =
    downloadState.status === "preparing" || downloadState.status === "choosing-location";

  const downloadButtonLabel =
    downloadState.status === "preparing"
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

  const downloadButtonIcon =
    downloadState.status === "saved"
      ? "codicon-check"
      : downloadState.status === "error"
        ? "codicon-error"
        : downloadState.status === "cancelled"
          ? "codicon-close"
          : isDownloadBusy
            ? "codicon-loading codicon-modifier-spin"
            : "codicon-cloud-download";

  const selectedProjectTab = useMemo(() => {
    if (!projectReport || selectedTab === "overview") {
      return null;
    }

    return projectReport.fileTabs.find((tab) => tab.filePath === selectedTab) || null;
  }, [projectReport, selectedTab]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-vscode-border px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="m-0 text-base font-semibold">
            {projectReport ? `${projectReport.projectName} Reports` : "Audit Report"}
          </h1>
          <span className="text-xs opacity-60">
            {projectReport
              ? `${projectReport.overview.auditedFileCount}/${projectReport.overview.totalAuditableFiles} files audited`
              : `${results.filter((result) => !result.ignored).length} issues`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="badge-error inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
            {aggregateCounts.error} errors
          </span>
          <span className="badge-warning inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
            {aggregateCounts.warning} warnings
          </span>
          <span className="badge-info inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
            {aggregateCounts.info} info
          </span>

          <button
            className="rounded bg-vscode-button-bg px-3 py-1 text-xs font-medium text-vscode-button-fg transition-colors hover:bg-vscode-button-hover disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleDownloadReport}
            disabled={isDownloadBusy}
            title={downloadState.message || "Download the current report as HTML"}
          >
            <span className={`codicon ${downloadButtonIcon} mr-1`} />
            {downloadButtonLabel}
          </button>
        </div>
      </header>

      {projectReport ? (
        <>
          <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-vscode-border px-3 py-2">
            <button
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedTab === "overview"
                  ? "bg-vscode-button-bg text-vscode-button-fg"
                  : "border border-vscode-border hover:bg-vscode-list-hover"
              }`}
              onClick={() => setSelectedTab("overview")}
            >
              Overview
            </button>
            {projectReport.fileTabs.map((tab) => (
              <button
                key={tab.filePath}
                className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedTab === tab.filePath
                    ? "bg-vscode-button-bg text-vscode-button-fg"
                    : "border border-vscode-border hover:bg-vscode-list-hover"
                }`}
                onClick={() => setSelectedTab(tab.filePath)}
                title={tab.filePath}
              >
                <span>{baseName(tab.filePath)}</span>
                <span className="rounded-full bg-vscode-badge-bg px-1.5 py-0.5 text-[11px] text-vscode-badge-fg">
                  {tab.issueCount}
                </span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {selectedTab === "overview" || !selectedProjectTab ? (
              <ProjectOverview report={projectReport} />
            ) : (
              <ProjectFileView tab={selectedProjectTab} onIgnore={handleIgnore} />
            )}
          </div>
        </>
      ) : (
        <FileReportView
          results={results}
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
          onIgnore={handleIgnore}
        />
      )}
    </div>
  );
}
