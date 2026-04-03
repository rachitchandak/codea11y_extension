import React, { useState } from "react";
import type { AuthStatePayload } from "../../shared/messages";

interface LoginViewProps {
  authState: AuthStatePayload;
  onLogin: (email: string, password: string) => void;
}

export default function LoginView({ authState, onLogin }: LoginViewProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const isBusy = authState.status === "checking" || authState.status === "authenticating";

  return (
    <div className="flex h-full min-h-0 flex-col bg-vscode-bg">
      <div className="border-b border-vscode-border px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="codicon codicon-lock opacity-70" />
          <h2 className="m-0 text-sm font-semibold">Sign in</h2>
        </div>
      </div>

      <div className="flex flex-1 items-center px-3 py-3">
        <section className="sidebar-detail-panel w-full px-3 py-3">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              onLogin(email.trim(), password);
            }}
          >
            <label className="block text-xs font-medium opacity-80">
              Email
              <input
                className="mt-1 w-full rounded-sm border border-vscode-input-border bg-vscode-input-bg px-3 py-2 text-sm text-vscode-input-fg outline-none focus:border-vscode-button-bg"
                type="email"
                value={email}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                disabled={isBusy}
              />
            </label>

            <label className="block text-xs font-medium opacity-80">
              Password
              <input
                className="mt-1 w-full rounded-sm border border-vscode-input-border bg-vscode-input-bg px-3 py-2 text-sm text-vscode-input-fg outline-none focus:border-vscode-button-bg"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
                disabled={isBusy}
              />
            </label>

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-sm bg-vscode-button-bg px-3 py-2 text-sm font-medium text-vscode-button-fg transition-colors hover:bg-vscode-button-hover disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isBusy || !email.trim() || !password}
            >
              {authState.status === "checking"
                ? "Checking session..."
                : authState.status === "authenticating"
                  ? "Signing in..."
                  : "Sign in"}
            </button>
          </form>

          {authState.error && (
            <div className="mt-3 rounded-sm border border-[var(--vscode-inputValidation-errorBorder)] bg-[var(--vscode-inputValidation-errorBackground)] px-3 py-2 text-xs">
              {authState.error}
            </div>
          )}

          {authState.notice && (
            <div className="mt-3 rounded-sm border border-[var(--vscode-inputValidation-warningBorder)] bg-[var(--vscode-inputValidation-warningBackground)] px-3 py-2 text-xs">
              {authState.notice}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}