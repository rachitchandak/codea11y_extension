import * as vscode from "vscode";
import type {
  WebviewToExtensionMessage,
  ExtensionToWebviewMessage,
  ReportDownloadPayload,
} from "../shared/messages";
import { getNonce } from "./getNonce";

let currentPanel: vscode.WebviewPanel | undefined;
let _ignoreIssueHandler: ((issueId: string) => void) | undefined;
let reportReady = false;
let pendingMessages: ExtensionToWebviewMessage[] = [];
let isSavingReport = false;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildReportHtml(payload: ReportDownloadPayload): string {
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

function postDownloadStatus(status: ExtensionToWebviewMessage): void {
  if (!currentPanel) {
    return;
  }

  if (!reportReady) {
    pendingMessages.push(status);
    return;
  }

  currentPanel.webview.postMessage(status);
}

async function saveReportAsHtml(
  payload: ReportDownloadPayload
): Promise<void> {
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
    vscode.window.showInformationMessage(
      `Codea11y: Report saved to ${targetUri.fsPath}`
    );
  } finally {
    isSavingReport = false;
  }
}

/**
 * Register a handler for IGNORE_ISSUE messages from the Report UI.
 */
export function onIgnoreIssue(handler: (issueId: string) => void): void {
  _ignoreIssueHandler = handler;
}

/**
 * Opens (or focuses) the full-width Report Panel.
 */
export function openReportPanel(extensionUri: vscode.Uri): vscode.WebviewPanel {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    return currentPanel;
  }

  reportReady = false;
  pendingMessages = [];

  currentPanel = vscode.window.createWebviewPanel(
    "codea11y.reportPanel",
    "Codea11y – Audit Report",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [extensionUri],
    }
  );

  currentPanel.webview.html = getHtml(currentPanel.webview, extensionUri);

  // ── Receive messages from the Report UI ──────────────────────────
  currentPanel.webview.onDidReceiveMessage(
    (message: WebviewToExtensionMessage) => {
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
          void saveReportAsHtml(message.payload).catch((error: unknown) => {
            const reason = error instanceof Error ? error.message : String(error);
            isSavingReport = false;
            postDownloadStatus({
              type: "REPORT_DOWNLOAD_STATUS",
              payload: {
                status: "error",
                message: reason,
              },
            });
            vscode.window.showErrorMessage(
              `Codea11y: Failed to save report - ${reason}`
            );
          });
          return;
        case "RETRY_AUDIT":
          vscode.commands.executeCommand("codea11y.startAudit");
          return;
      }
    }
  );

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
export function postToReportPanel(message: ExtensionToWebviewMessage): void {
  if (!currentPanel) return;

  if (!reportReady) {
    pendingMessages.push(message);
    return;
  }

  currentPanel.webview.postMessage(message);
}

/* -------------------------------------------------------------------- *
 *  HTML shell                                                          *
 * -------------------------------------------------------------------- */
function getHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "report.js")
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "report.css")
  );
  const nonce = getNonce();

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
