import React from "react";
import type { AuditResult, Severity } from "../../shared/messages";

const severityConfig: Record<
  Severity,
  { label: string; className: string; icon: string }
> = {
  error: {
    label: "Critical",
    className: "badge-error",
    icon: "codicon-error",
  },
  warning: {
    label: "Warning",
    className: "badge-warning",
    icon: "codicon-warning",
  },
  info: {
    label: "Info",
    className: "badge-info",
    icon: "codicon-info",
  },
};

interface IssueCardProps {
  issue: AuditResult;
  onIgnore: (id: string) => void;
}

export default function IssueCard({ issue, onIgnore }: IssueCardProps) {
  const cfg = severityConfig[issue.severity];

  return (
    <div
      className={`rounded-md border border-vscode-border mb-3 overflow-hidden transition-opacity ${
        issue.ignored ? "opacity-40" : ""
      }`}
    >
      {/* Card header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-vscode-input-bg border-b border-vscode-border">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}
          >
            <span className={`codicon ${cfg.icon}`} />
            {cfg.label}
          </span>
          {issue.source === "runtime" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-vscode-input-border bg-vscode-editorWidget-bg text-vscode-descriptionForeground">
              Runtime verified
            </span>
          )}
          <span className="text-sm font-semibold truncate">
            {issue.guideline}
          </span>
        </div>

        <button
          className="shrink-0 px-2.5 py-1 rounded text-xs font-medium
                     border border-vscode-input-border
                     hover:bg-vscode-list-hover transition-colors
                     disabled:opacity-30"
          disabled={issue.ignored}
          onClick={() => onIgnore(issue.id)}
          title="Ignore this issue"
        >
          <span className="codicon codicon-eye-closed mr-1" />
          Ignore
        </button>
      </div>

      {/* Card body */}
      <div className="px-4 py-3 space-y-3">
        {/* Issue description */}
        {issue.issueDescription && (
          <div>
            <h4 className="text-xs uppercase tracking-wide opacity-60 mb-1">
              Description
            </h4>
            <p className="text-sm leading-relaxed">{issue.issueDescription}</p>
          </div>
        )}

        {/* Code snippet */}
        {issue.snippet && (
          <div>
            <h4 className="text-xs uppercase tracking-wide opacity-60 mb-1">
              Code
            </h4>
            <pre className="code-snippet text-xs">{issue.snippet}</pre>
          </div>
        )}

        {/* Fix suggestion */}
        {issue.suggestion && (
          <div>
            <h4 className="text-xs uppercase tracking-wide opacity-60 mb-1">
              How to Fix
            </h4>
            <p className="text-sm leading-relaxed">{issue.suggestion}</p>
          </div>
        )}

        {/* Meta line */}
        {(issue.lineNumber || issue.selector) && (
          <div className="flex items-center gap-3 text-xs opacity-50 pt-1 border-t border-vscode-border">
            {issue.lineNumber && <span>Line {issue.lineNumber}</span>}
            {issue.selector && (
              <span className="font-mono truncate">{issue.selector}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
