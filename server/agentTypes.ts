/* ------------------------------------------------------------------ *
 *  Types shared across the agent system                               *
 * ------------------------------------------------------------------ */

export type AgentState =
  | "idle"
  | "intent"
  | "runtime"
  | "audit"
  | "validate"
  | "done"
  | "error";

export interface AgentTodoItem {
  file: string;
  status: "pending" | "scanning" | "done" | "skipped" | "error";
  reason: string;
}

export interface AgentEvent {
  event: string;
  data: unknown;
}

export type RuntimeMode = "required" | "cached";

export interface IntentSummaryEventData {
  totalFiles: number;
  runtimeMode: RuntimeMode;
}

export interface RuntimeUpdateEventData {
  status: "pending" | "analyzing" | "done" | "error" | "skipped";
  summary: string;
  details?: string[];
  countLabel?: string;
}

export interface AuditFileStartEventData {
  filePath: string;
  fileIndex: number;
  fileTotal: number;
  guidelineTotal: number;
}

export interface AuditGuidelineProgressEventData {
  filePath: string;
  guidelineId: string;
  guidelineDescription: string;
  guidelineIndex: number;
  guidelineTotal: number;
  latestStatus: "passed" | "failed" | "na";
  passCount: number;
  failCount: number;
  naCount: number;
}

export interface AuditFileCompleteEventData {
  filePath: string;
  guidelineTotal: number;
  status: "done" | "error" | "skipped";
  summary: string;
  passCount: number;
  failCount: number;
  naCount: number;
}

export interface ValidationUpdateEventData {
  status: "pending" | "analyzing" | "done" | "error" | "skipped";
  summary: string;
  completed?: number;
  total?: number;
  filePath?: string;
}

export interface AgentParams {
  userQuery: string;
  fileTree: unknown;
  rootPath: string;
  projectUrl?: string;
  forceRuntime?: boolean;
}

export interface RuntimeResult {
  id: string;
  filePath: string;
  guideline: string;
  severity: string;
  issueDescription: string;
  lineNumber: null;
  selector: string | null;
  snippet: string;
  suggestion: string;
  ignored: boolean;
  source: "runtime";
}
