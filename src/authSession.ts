import * as vscode from "vscode";
import type { AuthStatePayload, AuthUser } from "./shared/messages";
import { configureServerConnection } from "./serverClient";

const AUTH_TOKEN_SECRET_KEY = "codea11y.auth.token";
const DEFAULT_SERVER_BASE_URL = "http://localhost:3000/codea11y";

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function mapUser(user: {
  id: number;
  email: string;
  is_admin?: boolean;
  isApproved?: boolean;
  is_approved?: boolean;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    isAdmin: Boolean(user.is_admin),
    isApproved:
      typeof user.isApproved === "boolean"
        ? user.isApproved
        : typeof user.is_approved === "boolean"
          ? user.is_approved
          : undefined,
  };
}

export class AuthSessionManager {
  private token: string | undefined;
  private user: AuthUser | undefined;
  private status: AuthStatePayload["status"] = "checking";
  private error: string | undefined;
  private notice: string | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.syncServerConnection();
  }

  getServerBaseUrl(): string {
    const configuredBaseUrl = vscode.workspace
      .getConfiguration("codea11y")
      .get<string>("serverBaseUrl");
    return normalizeBaseUrl(configuredBaseUrl || DEFAULT_SERVER_BASE_URL);
  }

  getState(): AuthStatePayload {
    return {
      status: this.status,
      user: this.user,
      error: this.error,
      notice: this.notice,
      serverBaseUrl: this.getServerBaseUrl(),
    };
  }

  async initialize(): Promise<AuthStatePayload> {
    this.token = await this.context.secrets.get(AUTH_TOKEN_SECRET_KEY);
    this.syncServerConnection();

    if (!this.token) {
      this.status = "unauthenticated";
      this.error = undefined;
      this.notice = undefined;
      return this.getState();
    }

    try {
      await this.refreshCurrentUser();
      this.status = "authenticated";
      this.error = undefined;
    } catch (error) {
      await this.clearSession();
      this.status = "unauthenticated";
      this.error = error instanceof Error ? error.message : String(error);
    }

    return this.getState();
  }

  async login(email: string, password: string): Promise<AuthStatePayload> {
    this.status = "authenticating";
    this.error = undefined;
    this.notice = undefined;

    try {
      const response = await fetch(this.buildUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        token?: string;
        user?: {
          id: number;
          email: string;
          is_admin?: boolean;
          isApproved?: boolean;
          is_approved?: boolean;
        };
        error?: string;
        require_password_change?: boolean;
      };

      if (!response.ok || !body.token || !body.user) {
        throw new Error(body.error || `Login failed with status ${response.status}`);
      }

      this.token = body.token;
      this.user = mapUser(body.user);
      this.status = "authenticated";
      this.notice = body.require_password_change
        ? "Password change required for this account."
        : undefined;

      await this.context.secrets.store(AUTH_TOKEN_SECRET_KEY, body.token);
      this.syncServerConnection();
      return this.getState();
    } catch (error) {
      await this.clearSession();
      this.status = "unauthenticated";
      this.error = error instanceof Error ? error.message : String(error);
      return this.getState();
    }
  }

  async logout(): Promise<AuthStatePayload> {
    try {
      if (this.token) {
        await fetch(this.buildUrl("/api/auth/logout"), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
        });
      }
    } finally {
      await this.clearSession();
      this.status = "unauthenticated";
    }

    return this.getState();
  }

  isAuthenticated(): boolean {
    return this.status === "authenticated" && Boolean(this.token);
  }

  private buildUrl(pathname: string): string {
    return `${this.getServerBaseUrl()}${pathname}`;
  }

  private async refreshCurrentUser(): Promise<void> {
    if (!this.token) {
      throw new Error("No stored session token found.");
    }

    const response = await fetch(this.buildUrl("/api/user/me"), {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    const body = (await response.json().catch(() => ({}))) as {
      user?: {
        id: number;
        email: string;
        is_admin?: boolean;
        isApproved?: boolean;
        is_approved?: boolean;
      };
      error?: string;
    };

    if (!response.ok || !body.user) {
      throw new Error(body.error || `Session validation failed with status ${response.status}`);
    }

    this.user = mapUser(body.user);
  }

  private async clearSession(): Promise<void> {
    this.token = undefined;
    this.user = undefined;
    this.notice = undefined;
    await this.context.secrets.delete(AUTH_TOKEN_SECRET_KEY);
    this.syncServerConnection();
  }

  private syncServerConnection(): void {
    configureServerConnection({
      baseUrl: this.getServerBaseUrl(),
      authToken: this.token,
    });
  }
}