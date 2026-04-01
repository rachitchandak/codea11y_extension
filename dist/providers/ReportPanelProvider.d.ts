import * as vscode from "vscode";
import type { ExtensionToWebviewMessage } from "../shared/messages";
/**
 * Register a handler for IGNORE_ISSUE messages from the Report UI.
 */
export declare function onIgnoreIssue(handler: (issueId: string) => void): void;
/**
 * Opens (or focuses) the full-width Report Panel.
 */
export declare function openReportPanel(extensionUri: vscode.Uri): vscode.WebviewPanel;
/**
 * Push a message into the report panel (if open).
 */
export declare function postToReportPanel(message: ExtensionToWebviewMessage): void;
