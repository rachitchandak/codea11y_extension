import React, { useMemo, useState } from "react";
import type { AuditResult, Severity } from "../../shared/messages";
import { normalizeGuidelineLabel, severityRank } from "../shared/issueUtils";

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

interface IssueGroup {
  key: string;
  filePath: string;
  lineNumber?: number;
  selector?: string;
  label: string;
  issues: AuditResult[];
}

interface IssueCardProps {
  group: IssueGroup;
  onIgnore: (id: string) => void;
}

export default function IssueCard({ group, onIgnore }: IssueCardProps) {
  const [open, setOpen] = useState(true);

  const visibleIssues = useMemo(
    () => group.issues.filter((issue) => !issue.ignored),
    [group.issues]
  );

  const issues = visibleIssues.length > 0 ? visibleIssues : group.issues;
  const highestSeverity = issues.reduce<Severity>((current, issue) =>
    severityRank(issue.severity) > severityRank(current) ? issue.severity : current,
    "info"
  );
  const cfg = severityConfig[highestSeverity];
  const guidelineCount = visibleIssues.length > 0 ? visibleIssues.length : group.issues.length;
  const runtimeCount = issues.filter((issue) => issue.source === "runtime").length;

  return (
    <div
      className={`rounded-md border border-vscode-border mb-3 overflow-hidden transition-opacity ${
        visibleIssues.length === 0 ? "opacity-40" : ""
      }`}
    >
      {/* Card header */}
      <button
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-vscode-input-bg border-b border-vscode-border text-left"
        onClick={() => setOpen((current) => !current)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}
          >
            <span className={`codicon ${cfg.icon}`} />
            {cfg.label}
          </span>
          {runtimeCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-vscode-input-border bg-vscode-editorWidget-bg text-vscode-descriptionForeground">
              {runtimeCount === guidelineCount ? "Runtime verified" : `${runtimeCount} runtime`}
            </span>
          )}
          <span className="text-sm font-semibold truncate">
            {group.label}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0 pl-3">
          <span className="text-xs opacity-70">{guidelineCount} guideline{guidelineCount === 1 ? "" : "s"}</span>
          <span className={`codicon ${open ? "codicon-chevron-up" : "codicon-chevron-down"}`} />
        </div>
      </button>

      {/* Card body */}
      {open && (
        <div className="px-4 py-3 space-y-3">
          {(group.lineNumber || group.selector) && (
            <div className="flex items-center gap-3 text-xs opacity-50 pb-2 border-b border-vscode-border">
              {group.lineNumber && <span>Line {group.lineNumber}</span>}
              {group.selector && (
                <span className="font-mono truncate">{group.selector}</span>
              )}
            </div>
          )}

          {issues.map((issue) => {
            const issueCfg = severityConfig[issue.severity];

            return (
              <section
                key={issue.id}
                className={`rounded border border-vscode-border p-3 ${issue.ignored ? "opacity-40" : ""}`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${issueCfg.className}`}
                    >
                      <span className={`codicon ${issueCfg.icon}`} />
                      {issueCfg.label}
                    </span>
                    {issue.source === "runtime" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-vscode-input-border bg-vscode-editorWidget-bg text-vscode-descriptionForeground">
                        Runtime verified
                      </span>
                    )}
                    <span className="text-sm font-semibold truncate">
                      {normalizeGuidelineLabel(issue.guideline)}
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

                <div className="space-y-3">
                  {issue.issueDescription && (
                    <div>
                      <h4 className="text-xs uppercase tracking-wide opacity-60 mb-1">
                        Description
                      </h4>
                      <p className="text-sm leading-relaxed">{issue.issueDescription}</p>
                    </div>
                  )}

                  {issue.snippet && (
                    <div>
                      <h4 className="text-xs uppercase tracking-wide opacity-60 mb-1">
                        Code
                      </h4>
                      <pre className="code-snippet text-xs">{issue.snippet}</pre>
                    </div>
                  )}

                  {issue.suggestion && (
                    <div>
                      <h4 className="text-xs uppercase tracking-wide opacity-60 mb-1">
                        How to Fix
                      </h4>
                      <p className="text-sm leading-relaxed">{issue.suggestion}</p>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
