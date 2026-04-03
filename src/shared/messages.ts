/* ------------------------------------------------------------------ *
 *  Shared message contract between Extension ↔ Webviews              *
 * ------------------------------------------------------------------ */

// ── Severity levels for audit issues ──────────────────────────────
export type Severity = "error" | "warning" | "info";

export type TodoStatus = "pending" | "analyzing" | "done" | "error" | "skipped";

export type WorkflowKind = "audit";

export interface WorkflowState {
  kind: WorkflowKind;
  title: string;
  summary: string;
  status: TodoStatus;
  scopeLabel?: string;
  detail?: string;
}

export type ActivityPhase = "intent" | "runtime" | "audit" | "validate" | "complete";

// ── TO-DO / Active-Task item ──────────────────────────────────────
export interface TodoItem {
  id: string;
  title: string;
  status: TodoStatus;
  detail?: string;
  countLabel?: string;
}

// ── Single audit result row ───────────────────────────────────────
export interface AuditResult {
  id: string;
  filePath: string;
  guideline: string;        // e.g. "1.1.1 Non-text Content"
  severity: Severity;
  source?: "llm" | "runtime";
  snippet: string;           // code snippet
  ignored: boolean;
  lineNumber?: number;
  selector?: string;
  suggestion?: string;
  issueDescription?: string;
}

export interface ReportIssueGroup {
  key: string;
  filePath: string;
  lineNumber?: number;
  selector?: string;
  label: string;
  issues: AuditResult[];
}

export interface ReportFileEntry {
  filePath: string;
  issueCount: number;
}

export interface ReportDownloadPayload {
  results: AuditResult[];
  groupedIssues: ReportIssueGroup[];
  fileEntries: ReportFileEntry[];
  counts: Record<Severity, number>;
  suggestedFileName: string;
}

export interface FileReportReadyPayload {
  kind: "file";
  reportId: string;
  filePath: string;
  fileHash: string;
  createdAt: string;
  source: "opened" | "generated";
  overallAccessibilityScore: number;
  dependencies: string[];
  results: AuditResult[];
  groupedIssues: ReportIssueGroup[];
  fileEntries: ReportFileEntry[];
  counts: Record<Severity, number>;
}

export interface ProjectReportOverview {
  totalAuditableFiles: number;
  auditedFileCount: number;
  unauditedFileCount: number;
  averageAccessibilityScore: number | null;
  auditedFiles: Array<{
    filePath: string;
    fileHash: string | null;
    issueCount: number;
    accessibilityScore: number | null;
    scanStatus: string;
  }>;
  unauditedFiles: string[];
}

export interface ProjectReportFileTab {
  filePath: string;
  fileHash: string | null;
  issueCount: number;
  accessibilityScore: number | null;
  scanStatus: string;
  runtimeAnalyzed: boolean;
  results: AuditResult[];
  groupedIssues: ReportIssueGroup[];
  fileEntries: ReportFileEntry[];
  counts: Record<Severity, number>;
}

export interface ProjectReportReadyPayload {
  kind: "project";
  reportId: string;
  projectPath: string;
  projectName: string;
  createdAt: string;
  source: "snapshot";
  overview: ProjectReportOverview;
  fileTabs: ProjectReportFileTab[];
}

export type ReportReadyPayload = FileReportReadyPayload | ProjectReportReadyPayload;

// ── Chat message ──────────────────────────────────────────────────
export interface ChatMessage {
  kind: "message";
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  order?: number;
}

export interface ChatActivityLine {
  id: string;
  text: string;
  tone?: "default" | "muted" | "success" | "warning" | "error";
}

export interface ChatActivityItem {
  kind: "activity";
  id: string;
  order: number;
  phase: ActivityPhase;
  heading: string;
  status: TodoStatus;
  summary?: string;
  lines: ChatActivityLine[];
  countLabel?: string;
  autoCollapseOnDone?: boolean;
}

export type ChatTranscriptItem = ChatMessage | ChatActivityItem;

// ── Chat session (for the chat-list screen) ───────────────────────
export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;   // ISO date string
  updatedAt: string;   // ISO date string
  messageCount: number;
}

export interface AuthUser {
  id: number;
  email: string;
  isAdmin: boolean;
  isApproved?: boolean;
}

export interface AuthStatePayload {
  status: "checking" | "authenticating" | "authenticated" | "unauthenticated";
  serverBaseUrl: string;
  user?: AuthUser;
  error?: string;
  notice?: string;
}

// ── Messages the UI can SEND to the extension ─────────────────────
export type WebviewToExtensionMessage =
  | { type: "GET_AUTH_STATE"; payload?: undefined }
  | { type: "LOGIN_REQUEST"; payload: { email: string; password: string } }
  | { type: "LOGOUT"; payload?: undefined }
  | { type: "SEND_QUERY"; payload: { query: string; chatId: string } }
  | { type: "IGNORE_ISSUE"; payload: { issueId: string } }
  | { type: "DOWNLOAD_REPORT"; payload: ReportDownloadPayload }
  | { type: "WEBVIEW_READY"; payload?: undefined }
  | { type: "RETRY_AUDIT"; payload?: undefined }
  | { type: "GET_CHAT_LIST"; payload?: undefined }
  | { type: "CREATE_CHAT"; payload?: undefined }
  | { type: "DELETE_CHAT"; payload: { chatId: string } }
  | { type: "OPEN_CHAT"; payload: { chatId: string } }
  | { type: "RENAME_CHAT"; payload: { chatId: string; title: string } };

// ── Validation result from LLM-as-a-Judge ─────────────────────────
export interface ValidationResult {
  filePath: string;
  falsePositives: Array<{ wcagId: string; reason: string }>;
  validated: Array<{
    wcagId: string;
    confidence: "high" | "medium" | "low";
  }>;
}

// ── Messages the extension can SEND to the UI ─────────────────────
export type ExtensionToWebviewMessage =
  | { type: "AUTH_STATE"; payload: AuthStatePayload }
  | { type: "RESET_REPORT"; payload?: undefined }
  | { type: "REPORT_READY"; payload: ReportReadyPayload }
  | { type: "UPDATE_WORKFLOW"; payload: WorkflowState | null }
  | { type: "UPDATE_TODO"; payload: TodoItem[] }
  | { type: "SYNC_TODO"; payload: TodoItem[] }
  | { type: "RESET_CHAT_ACTIVITY"; payload?: undefined }
  | { type: "UPSERT_CHAT_ACTIVITY"; payload: ChatActivityItem }
  | {
      type: "REPORT_DOWNLOAD_STATUS";
      payload: {
        status: "preparing" | "choosing-location" | "saved" | "cancelled" | "error";
        message?: string;
      };
    }
  | { type: "STREAM_CHAT"; payload: ChatMessage }
  | { type: "NEW_AUDIT_RESULT"; payload: AuditResult }
  | { type: "VALIDATION_RESULT"; payload: ValidationResult }
  | { type: "CHAT_LIST"; payload: ChatSession[] }
  | { type: "CHAT_OPENED"; payload: { chatId: string; title: string; messages: ChatMessage[] } }
  | { type: "CHAT_CREATED"; payload: ChatSession }
  | { type: "CHAT_DELETED"; payload: { chatId: string } }
  | { type: "CHAT_RENAMED"; payload: { chatId: string; title: string } };
