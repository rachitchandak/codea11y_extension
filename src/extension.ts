import * as vscode from "vscode";
import { SidebarProvider } from "./providers/SidebarProvider";
import {
  openReportPanel,
  postToReportPanel,
  onIgnoreIssue,
} from "./providers/ReportPanelProvider";
import { buildFileTree, FileTreeNode } from "./ProjectScanner";
import {
  startServer,
  waitForServer,
  ignoreIssueOnServer,
  killServer,
  getProjectAuditSnapshot,
  retrieveOrInitiateReport,
  ServerNeedsUrlError,
} from "./serverClient";
import type {
  AuditResult,
  ChatMessage,
  ProjectReportReadyPayload,
  ReportFileEntry,
  ReportIssueGroup,
  Severity,
} from "./shared/messages";
import { handleAgentEvent, resetChatActivityState, resetSidebarTodoState } from "./eventHandler";
import {
  buildComponentGroupKey,
  buildIssueMergeKey,
  getComponentGroupLabel,
  mergeIssues,
  normalizeGuidelineLabel,
  sanitizeIssueSnippet,
  severityRank,
} from "./webview/shared/issueUtils";

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function flattenAuditableFiles(node: FileTreeNode, rootPath: string): string[] {
  if (node.type === "file") {
    return [normalizePath(vscode.Uri.joinPath(vscode.Uri.file(rootPath), node.relativePath).fsPath)];
  }

  return (node.children || []).flatMap((child) => flattenAuditableFiles(child, rootPath));
}

function normalizeReportIssue(issue: AuditResult): AuditResult {
  return {
    ...issue,
    filePath: normalizePath(issue.filePath),
    guideline: normalizeGuidelineLabel(issue.guideline),
    snippet: sanitizeIssueSnippet(issue.snippet),
  };
}

function buildGroupedIssues(results: AuditResult[]): ReportIssueGroup[] {
  const mergedResults = new Map<string, AuditResult>();

  for (const issue of results) {
    const mergeKey = buildIssueMergeKey(issue);
    const existing = mergedResults.get(mergeKey);
    mergedResults.set(mergeKey, existing ? mergeIssues(existing, issue) : issue);
  }

  const groups = new Map<string, ReportIssueGroup>();

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

  return [...groups.values()].map((group) => ({
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
}

function buildSeverityCounts(results: AuditResult[]): Record<Severity, number> {
  return results.reduce(
    (acc, result) => {
      if (!result.ignored) {
        acc[result.severity] += 1;
      }
      return acc;
    },
    { error: 0, warning: 0, info: 0 } as Record<Severity, number>
  );
}

function isAuditedFile(file: {
  scanStatus: string;
  accessibilityScore: number | null;
  results: AuditResult[];
}): boolean {
  return (
    file.scanStatus !== "pending" ||
    file.accessibilityScore !== null ||
    file.results.length > 0
  );
}

function createAssistantMessage(content: string): ChatMessage {
  return {
    kind: "message",
    id: crypto.randomUUID(),
    role: "assistant",
    content,
    isStreaming: false,
  };
}

function buildProjectReportPayload(args: {
  projectPath: string;
  projectName: string;
  createdAt: string;
  auditableFiles: string[];
  snapshotFiles: Array<{
    filePath: string;
    scanStatus: string;
    runtimeAnalyzed: boolean;
    accessibilityScore: number | null;
    results: AuditResult[];
  }>;
}): ProjectReportReadyPayload {
  const normalizedAuditableFiles = args.auditableFiles.map(normalizePath).sort((left, right) =>
    left.localeCompare(right)
  );

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
      issueCount,
      accessibilityScore: file.accessibilityScore,
      scanStatus: file.scanStatus,
      runtimeAnalyzed: file.runtimeAnalyzed,
      results: file.results,
      groupedIssues,
      fileEntries: [{ filePath: file.filePath, issueCount }] as ReportFileEntry[],
      counts: buildSeverityCounts(file.results),
    };
  });

  const auditedSet = new Set(fileTabs.map((tab) => normalizePath(tab.filePath)));
  const unauditedFiles = normalizedAuditableFiles.filter((filePath) => !auditedSet.has(filePath));
  const scoredFiles = fileTabs.filter((tab) => typeof tab.accessibilityScore === "number");
  const averageAccessibilityScore =
    scoredFiles.length > 0
      ? Math.round(
          scoredFiles.reduce((sum, tab) => sum + (tab.accessibilityScore || 0), 0) /
            scoredFiles.length
        )
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
export async function activate(context: vscode.ExtensionContext) {
  // ── Start proxy server ────────────────────────────────────────────
  try {
    await startServer(context.extensionPath);
    await waitForServer();
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `Codea11y: Failed to start server – ${err.message}`
    );
  }

  // ── Sidebar Chat View ─────────────────────────────────────────────
  const sidebarProvider = new SidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewType,
      sidebarProvider
    )
  );

  // ── Run agent-driven audit (MainAgent NDJSON stream) ──────────────
  async function runAgentAudit(query: string, projectUrl?: string) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("Codea11y: No workspace folder open.");
      return;
    }
    const rootPath = workspaceFolder.uri.fsPath;

    resetSidebarTodoState(sidebarProvider);
    resetChatActivityState(sidebarProvider);

    openReportPanel(context.extensionUri);
    postToReportPanel({ type: "RESET_REPORT", payload: undefined });

    try {
      const fileTree = buildFileTree(rootPath);

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
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line) as {
              event: string;
              data: Record<string, unknown>;
            };
            handleAgentEvent(evt, query, sidebarProvider, runAgentAudit);
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `Codea11y: Agent audit failed – ${err.message}`
      );
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

  async function openActiveFileReport(projectUrl?: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const activeFilePath = vscode.window.activeTextEditor?.document.uri.fsPath;

    if (!workspaceFolder) {
      vscode.window.showErrorMessage("Codea11y: No workspace folder open.");
      return;
    }

    if (!activeFilePath) {
      vscode.window.showErrorMessage(
        "Codea11y: Open a source file to retrieve or generate its report."
      );
      return;
    }

    openReportPanel(context.extensionUri);
    postToReportPanel({ type: "RESET_REPORT", payload: undefined });

    try {
      const report = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Codea11y: Opening accessibility report",
        },
        async () =>
          retrieveOrInitiateReport({
            filePath: activeFilePath,
            rootPath: workspaceFolder.uri.fsPath,
            projectUrl,
          })
      );

      postToReportPanel({
        type: "REPORT_READY",
        payload: report,
      });
    } catch (err) {
      if (err instanceof ServerNeedsUrlError) {
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

  async function openProjectReports(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("Codea11y: No workspace folder open.");
      return;
    }

    const rootPath = workspaceFolder.uri.fsPath;
    const fileTree = buildFileTree(rootPath);
    const auditableFiles = flattenAuditableFiles(fileTree, rootPath);

    try {
      const snapshot = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Codea11y: Opening project reports",
        },
        async () => getProjectAuditSnapshot(rootPath)
      );

      const reportPayload = buildProjectReportPayload({
        projectPath: snapshot.projectPath,
        projectName: snapshot.projectName,
        createdAt: snapshot.createdAt,
        auditableFiles,
        snapshotFiles: snapshot.files,
      });

      openReportPanel(context.extensionUri);
      postToReportPanel({ type: "RESET_REPORT", payload: undefined });
      postToReportPanel({
        type: "REPORT_READY",
        payload: reportPayload,
      });

      sidebarProvider.postMessage({
        type: "STREAM_CHAT",
        payload: createAssistantMessage(
          `Opened project reports for ${reportPayload.overview.auditedFileCount} audited file${reportPayload.overview.auditedFileCount === 1 ? "" : "s"}.`
        ),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Codea11y: Failed to open project reports - ${message}`);
      sidebarProvider.postMessage({
        type: "STREAM_CHAT",
        payload: createAssistantMessage(`Project reports failed: ${message}`),
      });
    }
  }

  // ── Wire SEND_QUERY → agent audit flow ────────────────────────────
  sidebarProvider.onSendQuery = (query: string, _chatId: string) => {
    if (/^\/reports?\b/i.test(query.trim())) {
      void openProjectReports();
      return;
    }

    void runAgentAudit(query);
  };

  // ── Wire IGNORE_ISSUE → server ───────────────────────────────────
  onIgnoreIssue(async (issueId: string) => {
    try {
      await ignoreIssueOnServer(issueId);
      vscode.window.showInformationMessage(
        `Codea11y: Issue ${issueId} marked as ignored.`
      );
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `Codea11y: Failed to ignore issue – ${err.message}`
      );
    }
  });

  // ── Open Report Panel command ─────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("codea11y.openReport", () => {
      void openActiveFileReport();
    })
  );

  // ── Start Audit command (from Command Palette) ────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("codea11y.startAudit", async () => {
      const query = await vscode.window.showInputBox({
        prompt: "Describe your accessibility audit focus",
        placeHolder:
          "e.g., Audit all React components for WCAG AA compliance",
      });
      if (query) {
        runAgentAudit(query);
      }
    })
  );

  // ── Dispose server on deactivation ────────────────────────────────
  context.subscriptions.push({
    dispose() {
      killServer();
    },
  });
}

export function deactivate() {
  killServer();
}
