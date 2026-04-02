import * as cp from "child_process";
import * as path from "path";
import type { AuditResult, FileReportReadyPayload } from "./shared/messages";

type RawFileReportPayload = Omit<FileReportReadyPayload, "kind">;

export interface ProjectAuditSnapshotFile {
  filePath: string;
  scanStatus: string;
  runtimeAnalyzed: boolean;
  accessibilityScore: number | null;
  results: AuditResult[];
}

export interface ProjectAuditSnapshotPayload {
  projectPath: string;
  projectName: string;
  createdAt: string;
  files: ProjectAuditSnapshotFile[];
}

export class ServerNeedsUrlError extends Error {
  readonly needsUrl = true;

  constructor(message: string) {
    super(message);
    this.name = "ServerNeedsUrlError";
  }
}

let serverProcess: cp.ChildProcess | undefined;

export function startServer(extensionPath: string): Promise<void> {
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

    setTimeout(() => reject(new Error("Server startup timeout")), 15_000);
  });
}

export async function waitForServer(retries = 20, delay = 500): Promise<void> {
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

export async function ignoreIssueOnServer(issueId: string): Promise<void> {
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

export async function retrieveOrInitiateReport(args: {
  filePath: string;
  rootPath: string;
  projectUrl?: string;
}): Promise<FileReportReadyPayload> {
  const res = await fetch("http://localhost:7544/reports/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  const body = (await res.json().catch(() => ({}))) as {
    report?: RawFileReportPayload;
    error?: string;
    needsUrl?: boolean;
  };

  if (!res.ok) {
    if (body.needsUrl) {
      throw new ServerNeedsUrlError(
        body.error || "A running project URL is required to generate a fresh report."
      );
    }

    throw new Error(body.error || `Failed to retrieve report: ${res.status}`);
  }

  if (!body.report) {
    throw new Error("Server did not return a report payload.");
  }

  return {
    kind: "file",
    ...body.report,
  };
}

export async function getReportById(reportId: string): Promise<FileReportReadyPayload> {
  const res = await fetch(`http://localhost:7544/reports/${encodeURIComponent(reportId)}`);
  const body = (await res.json().catch(() => ({}))) as {
    report?: RawFileReportPayload;
    error?: string;
  };

  if (!res.ok || !body.report) {
    throw new Error(body.error || `Failed to fetch report ${reportId}`);
  }

  return {
    kind: "file",
    ...body.report,
  };
}

export async function getProjectAuditSnapshot(
  rootPath: string
): Promise<ProjectAuditSnapshotPayload> {
  const res = await fetch("http://localhost:7544/reports/project-snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rootPath }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    projectPath?: string;
    projectName?: string;
    createdAt?: string;
    files?: ProjectAuditSnapshotFile[];
    error?: string;
  };

  if (!res.ok) {
    throw new Error(body.error || `Failed to fetch project snapshot: ${res.status}`);
  }

  return {
    projectPath: body.projectPath || rootPath,
    projectName: body.projectName || path.basename(rootPath),
    createdAt: body.createdAt || new Date().toISOString(),
    files: body.files || [],
  };
}

export function killServer(): void {
  serverProcess?.kill();
  serverProcess = undefined;
}
