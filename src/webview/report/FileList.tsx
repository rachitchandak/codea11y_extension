import React from "react";

interface FileEntry {
  filePath: string;
  issueCount: number;
}

interface FileListProps {
  files: FileEntry[];
  selectedFile: string | null;
  onSelectFile: (filePath: string) => void;
}

/** Extract the filename from a full path. */
function baseName(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || filePath;
}

export default function FileList({
  files,
  selectedFile,
  onSelectFile,
}: FileListProps) {
  return (
    <aside className="w-[280px] shrink-0 border-r border-vscode-border flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-vscode-border">
        <h2 className="text-xs uppercase tracking-wide font-semibold opacity-70 m-0">
          Audited Files
        </h2>
      </div>

      {/* File list */}
      <ul className="flex-1 overflow-y-auto m-0 p-0 list-none">
        {files.length === 0 && (
          <li className="px-3 py-6 text-center text-xs opacity-40">
            No files audited yet.
          </li>
        )}

        {files.map(({ filePath, issueCount }) => {
          const isActive = filePath === selectedFile;
          return (
            <li key={filePath}>
              <button
                className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2
                  text-sm transition-colors cursor-pointer border-none outline-none
                  ${
                    isActive
                      ? "bg-vscode-list-hover font-medium"
                      : "bg-transparent hover:bg-vscode-list-hover"
                  }`}
                style={{ color: "var(--vscode-editor-foreground)" }}
                onClick={() => onSelectFile(filePath)}
                title={filePath}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="codicon codicon-file text-xs opacity-60" />
                  <span className="truncate">{baseName(filePath)}</span>
                </span>

                {issueCount > 0 && (
                  <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium bg-vscode-badge-bg text-vscode-badge-fg">
                    {issueCount}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
