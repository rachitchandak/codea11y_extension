import type { AuditResult, FileReportReadyPayload } from "./shared/messages";
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
export declare class ServerNeedsUrlError extends Error {
    readonly needsUrl = true;
    constructor(message: string);
}
export declare function configureServerConnection(args: {
    baseUrl?: string;
    authToken?: string;
}): void;
export declare function startServer(extensionPath: string): Promise<void>;
export declare function waitForServer(retries?: number, delay?: number): Promise<void>;
export declare function ignoreIssueOnServer(issueId: string): Promise<void>;
export declare function retrieveOrInitiateReport(args: {
    filePath: string;
    rootPath: string;
    projectUrl?: string;
}): Promise<FileReportReadyPayload>;
export declare function getReportById(reportId: string): Promise<FileReportReadyPayload>;
export declare function getProjectAuditSnapshot(rootPath: string): Promise<ProjectAuditSnapshotPayload>;
export declare function startAgentAuditStream(args: {
    userQuery: string;
    fileTree: unknown;
    rootPath: string;
    projectUrl?: string;
}): Promise<Response>;
export declare function killServer(): void;
