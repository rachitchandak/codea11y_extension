export type Severity = "error" | "warning" | "info";
export interface TodoItem {
    filePath: string;
    status: "pending" | "analyzing" | "done" | "error" | "skipped";
    message?: string;
    reason?: string;
}
export interface AuditResult {
    id: string;
    filePath: string;
    guideline: string;
    severity: Severity;
    source?: "llm" | "runtime";
    snippet: string;
    ignored: boolean;
    lineNumber?: number;
    selector?: string;
    suggestion?: string;
    issueDescription?: string;
}
export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    isStreaming?: boolean;
}
export interface ChatSession {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
}
export type WebviewToExtensionMessage = {
    type: "SEND_QUERY";
    payload: {
        query: string;
        chatId: string;
    };
} | {
    type: "IGNORE_ISSUE";
    payload: {
        issueId: string;
    };
} | {
    type: "REPORT_READY";
    payload?: undefined;
} | {
    type: "RETRY_AUDIT";
    payload?: undefined;
} | {
    type: "GET_CHAT_LIST";
    payload?: undefined;
} | {
    type: "CREATE_CHAT";
    payload?: undefined;
} | {
    type: "DELETE_CHAT";
    payload: {
        chatId: string;
    };
} | {
    type: "OPEN_CHAT";
    payload: {
        chatId: string;
    };
} | {
    type: "RENAME_CHAT";
    payload: {
        chatId: string;
        title: string;
    };
};
export interface ValidationResult {
    filePath: string;
    falsePositives: Array<{
        wcagId: string;
        reason: string;
    }>;
    missedIssues: Array<{
        wcagId: string;
        description: string;
        severity: Severity;
    }>;
    validated: Array<{
        wcagId: string;
        confidence: "high" | "medium" | "low";
    }>;
}
export type ExtensionToWebviewMessage = {
    type: "RESET_REPORT";
    payload?: undefined;
} | {
    type: "UPDATE_TODO";
    payload: TodoItem[];
} | {
    type: "SYNC_TODO";
    payload: TodoItem[];
} | {
    type: "STREAM_CHAT";
    payload: ChatMessage;
} | {
    type: "NEW_AUDIT_RESULT";
    payload: AuditResult;
} | {
    type: "SET_PROGRESS";
    payload: {
        percent: number;
        label: string;
    };
} | {
    type: "VALIDATION_RESULT";
    payload: ValidationResult;
} | {
    type: "CHAT_LIST";
    payload: ChatSession[];
} | {
    type: "CHAT_OPENED";
    payload: {
        chatId: string;
        title: string;
        messages: ChatMessage[];
    };
} | {
    type: "CHAT_CREATED";
    payload: ChatSession;
} | {
    type: "CHAT_DELETED";
    payload: {
        chatId: string;
    };
} | {
    type: "CHAT_RENAMED";
    payload: {
        chatId: string;
        title: string;
    };
};
