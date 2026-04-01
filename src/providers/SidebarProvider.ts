import * as vscode from "vscode";
import type {
  WebviewToExtensionMessage,
  ExtensionToWebviewMessage,
} from "../shared/messages";

/**
 * Provides the sidebar chat webview (WebviewViewProvider).
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "codea11y.chatView";

  private _view?: vscode.WebviewView;

  /** Set by extension.ts to handle incoming audit queries. */
  public onSendQuery?: (query: string, chatId: string) => void;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  /* ------------------------------------------------------------------ *
   *  Called by VS Code when the sidebar view becomes visible            *
   * ------------------------------------------------------------------ */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    // ── Receive messages from the React UI ─────────────────────────
    webviewView.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => {
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
      }
    );
  }

  /* ------------------------------------------------------------------ *
   *  Public helper – push a message into the sidebar webview            *
   * ------------------------------------------------------------------ */
  public postMessage(message: ExtensionToWebviewMessage): void {
    this._view?.webview.postMessage(message);
  }

  /* ------------------------------------------------------------------ *
   *  Handle a chat query (placeholder – wire your LLM backend here)    *
   * ------------------------------------------------------------------ */
  private _handleSendQuery(query: string, chatId: string): void {
    if (this.onSendQuery) {
      this.onSendQuery(query, chatId);
      return;
    }
    // Fallback echo when no handler is attached
    this.postMessage({
      type: "STREAM_CHAT",
      payload: {
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

  private _handleGetChatList(): void {
    // TODO: Replace with actual DB query
    this.postMessage({
      type: "CHAT_LIST",
      payload: this._demoChatSessions,
    });
  }

  private _handleCreateChat(): void {
    // Default title is the workspace root folder name
    const workspaceName =
      vscode.workspace.workspaceFolders?.[0]?.name ?? "New Chat";
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

  private _handleDeleteChat(chatId: string): void {
    this._demoChatSessions = this._demoChatSessions.filter(
      (c) => c.id !== chatId
    );
    this.postMessage({ type: "CHAT_DELETED", payload: { chatId } });
  }

  private _handleOpenChat(chatId: string): void {
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

  private _handleRenameChat(chatId: string, title: string): void {
    const session = this._demoChatSessions.find((c) => c.id === chatId);
    if (session) {
      session.title = title;
      session.updatedAt = new Date().toISOString();
    }
    this.postMessage({ type: "CHAT_RENAMED", payload: { chatId, title } });
  }

  // In-memory placeholder – replace with DB calls
  private _demoChatSessions: Array<{
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
  }> = [];

  /* ------------------------------------------------------------------ *
   *  Generate the HTML shell that loads the React bundle                *
   * ------------------------------------------------------------------ */
  private _getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "sidebar.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "sidebar.css")
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
  <title>Codea11y Chat</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/* -------------------------------------------------------------------- *
 *  Utility: generate a random nonce for the CSP                        *
 * -------------------------------------------------------------------- */
function getNonce(): string {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return nonce;
}
