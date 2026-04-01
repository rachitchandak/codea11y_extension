import * as vscode from "vscode";
import type {
  WebviewToExtensionMessage,
  ExtensionToWebviewMessage,
} from "../shared/messages";

let currentPanel: vscode.WebviewPanel | undefined;
let _ignoreIssueHandler: ((issueId: string) => void) | undefined;
let reportReady = false;
let pendingMessages: ExtensionToWebviewMessage[] = [];

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
        case "REPORT_READY": {
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

function getNonce(): string {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return nonce;
}
