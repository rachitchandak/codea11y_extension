import * as vscode from "vscode";
import type { AuthStatePayload, ExtensionToWebviewMessage } from "../shared/messages";
/**
 * Provides the sidebar chat webview (WebviewViewProvider).
 */
export declare class SidebarProvider implements vscode.WebviewViewProvider {
    private readonly _extensionUri;
    static readonly viewType = "codea11y.chatView";
    private _view?;
    /** Set by extension.ts to handle incoming audit queries. */
    onSendQuery?: (query: string, chatId: string) => void;
    onLoginRequest?: (email: string, password: string) => Promise<void>;
    onLogout?: () => Promise<void>;
    getAuthState?: () => AuthStatePayload;
    constructor(_extensionUri: vscode.Uri);
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    postMessage(message: ExtensionToWebviewMessage): void;
    private _postAuthState;
    private _isAuthenticated;
    private _handleLoginRequest;
    private _handleLogout;
    private _handleSendQuery;
    private _handleGetChatList;
    private _handleCreateChat;
    private _handleDeleteChat;
    private _handleOpenChat;
    private _handleRenameChat;
    private _demoChatSessions;
    private _getHtml;
}
