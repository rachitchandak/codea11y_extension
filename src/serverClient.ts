import * as path from "path";
import type { AuditResult, FileReportReadyPayload } from "./shared/messages";

type RawFileReportPayload = Omit<FileReportReadyPayload, "kind">;

export interface ProjectAuditSnapshotFile {
  filePath: string;
  fileHash: string | null;
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

export async function waitForServer(retries = 10, delay = 1000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch("http://localhost:7544/health");
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error(
    "Could not connect to Codea11y server on port 7544. " +
    "Please start the server manually before using the extension."
  );
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


