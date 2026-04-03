import * as vscode from "vscode";
import type { AuthStatePayload } from "./shared/messages";
export declare class AuthSessionManager {
    private readonly context;
    private token;
    private user;
    private status;
    private error;
    private notice;
    constructor(context: vscode.ExtensionContext);
    getServerBaseUrl(): string;
    getState(): AuthStatePayload;
    initialize(): Promise<AuthStatePayload>;
    login(email: string, password: string): Promise<AuthStatePayload>;
    logout(): Promise<AuthStatePayload>;
    isAuthenticated(): boolean;
    private buildUrl;
    private refreshCurrentUser;
    private clearSession;
    private syncServerConnection;
}
