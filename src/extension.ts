import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import { SidebarProvider } from "./providers/SidebarProvider";
import {
  openReportPanel,
  postToReportPanel,
  onIgnoreIssue,
} from "./providers/ReportPanelProvider";
import { buildFileTree } from "./ProjectScanner";

let serverProcess: cp.ChildProcess | undefined;

/* ------------------------------------------------------------------ *
 *  Start the local proxy server as a child process                    *
 * ------------------------------------------------------------------ */
function startServer(extensionPath: string): Promise<void> {
  const serverScript = path.join(extensionPath, "dist", "server", "index.js");

  return new Promise((resolve, reject) => {
    serverProcess = cp.spawn("node", [serverScript], {
      cwd: extensionPath,
      env: {
        ...process.env,
        CODEA11Y_PORT: "7544",
        CODEA11Y_ROOT: extensionPath,
        CODEA11Y_DB_DIR: extensionPath,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    serverProcess.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString();
      console.log("[codea11y-server]", msg);
      if (msg.includes("running on")) {
        resolve();
      }
    });

    serverProcess.stderr?.on("data", (data: Buffer) => {
      console.error("[codea11y-server]", data.toString());
    });

    serverProcess.on("error", (err) => {
      reject(new Error(`Failed to start server: ${err.message}`));
    });

    serverProcess.on("exit", (code) => {
      if (code !== null && code !== 0) {
        reject(new Error(`Server exited with code ${code}`));
      }
    });

    // Timeout safety net
    setTimeout(() => reject(new Error("Server startup timeout")), 15_000);
  });
}

/* ------------------------------------------------------------------ *
 *  Poll /health until the server is ready                             *
 * ------------------------------------------------------------------ */
async function waitForServer(retries = 20, delay = 500): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch("http://localhost:7544/health");
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error("Server did not become ready in time");
}

async function ignoreIssueOnServer(issueId: string): Promise<void> {
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

    sidebarProvider.postMessage({
      type: "STREAM_CHAT",
      payload: {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Starting agent-driven accessibility audit for: "${query}"`,
        isStreaming: false,
      },
    });

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
        buffer = lines.pop()!; // keep last incomplete line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line) as {
              event: string;
              data: Record<string, unknown>;
            };
            handleAgentEvent(evt, query);
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
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Audit failed: ${err.message}`,
          isStreaming: false,
        },
      });
    }
  }

  // ── Handle NDJSON events from the MainAgent stream ────────────────
  function handleAgentEvent(
    evt: { event: string; data: Record<string, unknown> },
    query: string
  ) {
    switch (evt.event) {
      case "SYNC_TODO": {
        const todos = (evt.data as any).todos || [];
        sidebarProvider.postMessage({
          type: "UPDATE_TODO",
          payload: todos.map((t: any) => ({
            filePath: t.file,
            status: t.status === "scanning" ? "analyzing" : t.status,
            message: t.reason,
            reason: t.reason,
          })),
        });
        break;
      }
      case "AGENT_MESSAGE": {
        sidebarProvider.postMessage({
          type: "STREAM_CHAT",
          payload: {
            id: crypto.randomUUID(),
            role: "assistant",
            content: String((evt.data as any).content || ""),
            isStreaming: false,
          },
        });
        break;
      }
      case "NEW_AUDIT_RESULT": {
        postToReportPanel({
          type: "NEW_AUDIT_RESULT",
          payload: evt.data as any,
        });
        break;
      }
      case "SET_PROGRESS": {
        const msg = {
          type: "SET_PROGRESS" as const,
          payload: evt.data as { percent: number; label: string },
        };
        sidebarProvider.postMessage(msg);
        postToReportPanel(msg);
        break;
      }
      case "NEED_URL": {
        vscode.window
          .showInputBox({
            prompt: String(
              (evt.data as any).message ||
                "Provide the URL where your project is running"
            ),
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
        postToReportPanel({
          type: "VALIDATION_RESULT" as any,
          payload: evt.data as any,
        });
        break;
      }
      case "DONE": {
        vscode.window.showInformationMessage("Codea11y: Audit complete!");
        break;
      }
      case "ERROR": {
        vscode.window.showWarningMessage(
          `Codea11y: ${(evt.data as any).message || "Unknown error"}`
        );
        break;
      }
    }
  }

  // ── Wire SEND_QUERY → agent audit flow ────────────────────────────
  sidebarProvider.onSendQuery = (query: string, _chatId: string) => {
    runAgentAudit(query);
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
      openReportPanel(context.extensionUri);
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
      serverProcess?.kill();
      serverProcess = undefined;
    },
  });
}

export function deactivate() {
  serverProcess?.kill();
  serverProcess = undefined;
}
