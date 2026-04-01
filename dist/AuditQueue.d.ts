import type { TodoItem, AuditResult } from "./shared/messages";
export interface AuditQueueCallbacks {
    onTodoUpdate(todos: TodoItem[]): void;
    onAuditResult(result: AuditResult): void;
    onProgress(percent: number, label: string): void;
    onComplete(): void;
    onError(error: string): void;
}
export declare class AuditQueue {
    private callbacks;
    private queue;
    private todos;
    private wcagCategories;
    private projectId;
    private rootPath;
    private processing;
    constructor(callbacks: AuditQueueCallbacks);
    get isProcessing(): boolean;
    initSession(userQuery: string, fileTree: unknown, rootPath: string): Promise<void>;
    processQueue(): Promise<void>;
}
export declare function ignoreIssueOnServer(issueId: string): Promise<void>;
