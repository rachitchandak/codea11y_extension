import * as path from "path";
import * as vscode from "vscode";
import { SidebarProvider } from "./providers/SidebarProvider";
import type {
  ChatActivityItem,
  ChatActivityLine,
  ChatMessage,
  TodoItem,
  TodoStatus,
  WorkflowState,
} from "./shared/messages";
import { postToReportPanel } from "./providers/ReportPanelProvider";

type PhaseName = "runtime" | "audit" | "validate";

interface IntentSummaryPayload {
  totalFiles: number;
  runtimeMode: "required" | "cached";
}

interface RuntimeUpdatePayload {
  status: TodoStatus;
  summary: string;
  details?: string[];
  countLabel?: string;
}

interface AuditFileStartPayload {
  filePath: string;
  fileIndex: number;
  fileTotal: number;
  guidelineTotal: number;
}

interface AuditGuidelineProgressPayload {
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

interface AuditFileCompletePayload {
  filePath: string;
  guidelineTotal: number;
  status: "done" | "error" | "skipped";
  summary: string;
  passCount: number;
  failCount: number;
  naCount: number;
}

interface ValidationUpdatePayload {
  status: TodoStatus;
  summary: string;
  completed?: number;
  total?: number;
  filePath?: string;
}

let sidebarTodoItems: TodoItem[] = [];
let sidebarWorkflowState: WorkflowState | null = null;
let activityItems = new Map<string, ChatActivityItem>();
let nextActivityOrder = 1;

function syncWorkflowState(sidebarProvider: SidebarProvider): void {
  sidebarProvider.postMessage({
    type: "UPDATE_WORKFLOW",
    payload: sidebarWorkflowState,
  });
}

function cloneTodoItems(todos: TodoItem[]): TodoItem[] {
  return todos.map((todo) => ({ ...todo }));
}

function syncSidebarTodos(sidebarProvider: SidebarProvider): void {
  sidebarProvider.postMessage({
    type: "UPDATE_TODO",
    payload: cloneTodoItems(sidebarTodoItems),
  });
}

function setSidebarTodos(todos: TodoItem[]): void {
  sidebarTodoItems = cloneTodoItems(todos);
}

function buildCountLabel(completed?: number, total?: number): string | undefined {
  if (typeof total !== "number" || total <= 0) {
    return undefined;
  }

  return `${completed ?? 0}/${total}`;
}

function updateSidebarTodo(
  id: PhaseName,
  updates: Partial<TodoItem> | ((todo: TodoItem) => Partial<TodoItem>)
): void {
  const index = sidebarTodoItems.findIndex((todo) => todo.id === id);
  if (index === -1) {
    return;
  }

  const current = sidebarTodoItems[index];
  const patch = typeof updates === "function" ? updates(current) : updates;
  sidebarTodoItems = [...sidebarTodoItems];
  sidebarTodoItems[index] = {
    ...current,
    ...patch,
  };
}

function getSidebarTodo(id: PhaseName): TodoItem | undefined {
  return sidebarTodoItems.find((todo) => todo.id === id);
}

function createAssistantMessage(content: string): ChatMessage {
  return {
    kind: "message",
    id: crypto.randomUUID(),
    role: "assistant",
    content,
    isStreaming: false,
  };
}

function toActivityId(filePath: string): string {
  return `audit:${filePath.replace(/\\/g, "/").toLowerCase()}`;
}

function createLines(values: Array<string | null | undefined>): ChatActivityLine[] {
  return values
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((text, index) => ({ id: `${index}:${text}`, text }));
}

function upsertActivity(
  sidebarProvider: SidebarProvider,
  activity: Omit<ChatActivityItem, "kind" | "order"> & { order?: number }
): void {
  const existing = activityItems.get(activity.id);
  const next: ChatActivityItem = {
    kind: "activity",
    order: existing?.order ?? activity.order ?? nextActivityOrder++,
    autoCollapseOnDone: true,
    ...existing,
    ...activity,
  };

  activityItems.set(next.id, next);
  sidebarProvider.postMessage({
    type: "UPSERT_CHAT_ACTIVITY",
    payload: next,
  });
}

export function resetChatActivityState(sidebarProvider?: SidebarProvider): void {
  activityItems = new Map<string, ChatActivityItem>();
  nextActivityOrder = 1;
  if (sidebarProvider) {
    sidebarProvider.postMessage({ type: "RESET_CHAT_ACTIVITY" });
  }
}

export function resetSidebarTodoState(sidebarProvider?: SidebarProvider): void {
  sidebarTodoItems = [];
  sidebarWorkflowState = null;
  if (sidebarProvider) {
    syncSidebarTodos(sidebarProvider);
    syncWorkflowState(sidebarProvider);
  }
}

/**
 * Handle NDJSON events streamed from the MainAgent on the server.
 */
export function handleAgentEvent(
  evt: { event: string; data: Record<string, unknown> },
  query: string,
  sidebarProvider: SidebarProvider,
  runAgentAudit: (query: string, projectUrl?: string) => void
): void {
  switch (evt.event) {
    case "WORKFLOW_CONTEXT": {
      sidebarWorkflowState = evt.data as unknown as WorkflowState;
      syncWorkflowState(sidebarProvider);
      break;
    }
    case "WORKFLOW_TODOS": {
      setSidebarTodos((evt.data as { todos?: TodoItem[] }).todos || []);
      syncSidebarTodos(sidebarProvider);
      break;
    }
    case "PHASE_STATUS": {
      const payload = evt.data as {
        phase: PhaseName;
        status: TodoStatus;
        detail?: string;
        completed?: number;
        total?: number;
      };
      updateSidebarTodo(payload.phase, (todo) => ({
        status: payload.status,
        detail: payload.detail || todo.detail,
        countLabel:
          payload.phase === "audit" || payload.phase === "validate"
            ? buildCountLabel(payload.completed, payload.total)
            : todo.countLabel,
      }));
      syncSidebarTodos(sidebarProvider);
      break;
    }
    case "SYNC_TODO": {
      const todos = (evt.data as { todos?: Array<{ status: string }> }).todos || [];
      const total = todos.length;
      const completed = todos.filter((t) =>
        ["done", "skipped", "error"].includes(t.status)
      ).length;
      const hasActiveScan = todos.some((t) => t.status === "scanning");
      const hasErrors = todos.some((t) => t.status === "error");

      updateSidebarTodo("audit", {
        status:
          total === 0
            ? "pending"
            : completed >= total
              ? hasErrors
                ? "error"
                : "done"
              : hasActiveScan || completed > 0
                ? "analyzing"
                : "pending",
        detail:
          total === 0
            ? "Waiting for file selection"
            : completed >= total
              ? hasErrors
                ? "File audit finished with one or more errors"
                : "File audit complete"
              : `Audited ${completed} of ${total} files`,
        countLabel: buildCountLabel(completed, total),
      });

      if (getSidebarTodo("runtime")?.status === "analyzing" && (hasActiveScan || completed > 0)) {
        updateSidebarTodo("runtime", {
          status: "done",
          detail: "Runtime analysis complete",
        });
      }

      syncSidebarTodos(sidebarProvider);
      break;
    }
    case "INTENT_SUMMARY": {
      const payload = evt.data as unknown as IntentSummaryPayload;
      upsertActivity(sidebarProvider, {
        id: "intent-summary",
        phase: "intent",
        heading: "Analyzing your project",
        status: "done",
        summary: `Identified ${payload.totalFiles} file(s) to audit.`,
        lines: createLines([
          payload.runtimeMode === "required"
            ? "Runtime analysis will run for this audit."
            : "Runtime analysis already available from a previous run.",
        ]),
      });
      break;
    }
    case "RUNTIME_UPDATE": {
      const payload = evt.data as unknown as RuntimeUpdatePayload;
      upsertActivity(sidebarProvider, {
        id: "runtime-analysis",
        phase: "runtime",
        heading: "Runtime analysis",
        status: payload.status,
        summary: payload.summary,
        countLabel: payload.countLabel,
        lines: createLines(payload.details || []),
      });
      break;
    }
    case "AUDIT_FILE_START": {
      const payload = evt.data as unknown as AuditFileStartPayload;
      upsertActivity(sidebarProvider, {
        id: toActivityId(payload.filePath),
        phase: "audit",
        heading: `Auditing ${path.basename(payload.filePath)}`,
        status: "analyzing",
        summary: `Guideline 0/${payload.guidelineTotal}`,
        countLabel: `0/${payload.guidelineTotal}`,
        lines: createLines([
          `File ${payload.fileIndex}/${payload.fileTotal}`,
          "Passed 0, Failed 0, N/A 0",
        ]),
      });
      break;
    }
    case "AUDIT_GUIDELINE_PROGRESS": {
      const payload = evt.data as unknown as AuditGuidelineProgressPayload;
      upsertActivity(sidebarProvider, {
        id: toActivityId(payload.filePath),
        phase: "audit",
        heading: `Auditing ${path.basename(payload.filePath)}`,
        status: "analyzing",
        summary: `Guideline ${payload.guidelineIndex}/${payload.guidelineTotal}`,
        countLabel: `${payload.guidelineIndex}/${payload.guidelineTotal}`,
        lines: createLines([
          `Checking ${payload.guidelineId} — ${payload.guidelineDescription}`,
          `Latest result: ${payload.latestStatus.toUpperCase()}`,
          `Passed ${payload.passCount}, Failed ${payload.failCount}, N/A ${payload.naCount}`,
        ]),
      });
      break;
    }
    case "AUDIT_FILE_COMPLETE": {
      const payload = evt.data as unknown as AuditFileCompletePayload;
      upsertActivity(sidebarProvider, {
        id: toActivityId(payload.filePath),
        phase: "audit",
        heading: `Auditing ${path.basename(payload.filePath)}`,
        status: payload.status,
        summary: payload.summary,
        countLabel: `${payload.guidelineTotal}/${payload.guidelineTotal}`,
        lines: createLines([
          `Passed ${payload.passCount}, Failed ${payload.failCount}, N/A ${payload.naCount}`,
        ]),
      });
      break;
    }
    case "VALIDATION_UPDATE": {
      const payload = evt.data as unknown as ValidationUpdatePayload;
      upsertActivity(sidebarProvider, {
        id: "validation-summary",
        phase: "validate",
        heading: "Final validation",
        status: payload.status,
        summary: payload.summary,
        countLabel:
          payload.total && payload.total > 0
            ? `${payload.completed ?? 0}/${payload.total}`
            : undefined,
        lines: createLines([
          payload.filePath ? `Current file: ${path.basename(payload.filePath)}` : undefined,
        ]),
      });
      break;
    }
    case "REPORT_READY": {
      break;
    }
    case "AGENT_MESSAGE": {
      const content = String((evt.data as { content?: string }).content || "");
      if (!content) {
        break;
      }
      sidebarProvider.postMessage({
        type: "STREAM_CHAT",
        payload: createAssistantMessage(content),
      });
      break;
    }
    case "NEW_AUDIT_RESULT": {
      postToReportPanel({
        type: "NEW_AUDIT_RESULT",
        payload: evt.data as never,
      });
      break;
    }
    case "NEED_URL": {
      upsertActivity(sidebarProvider, {
        id: "runtime-analysis",
        phase: "runtime",
        heading: "Runtime analysis",
        status: "error",
        summary: "Project URL required to continue.",
        lines: createLines([
          "Provide the URL where the project is currently running.",
        ]),
      });
      vscode.window
        .showInputBox({
          prompt: String(
            (evt.data as { message?: string }).message ||
              "Provide the URL where your project is running"
          ),
          placeHolder: "http://localhost:3000",
        })
        .then((url) => {
          if (url) {
            runAgentAudit(query, url);
          }
        });
      break;
    }
    case "VALIDATION_RESULT": {
      postToReportPanel({
        type: "VALIDATION_RESULT",
        payload: evt.data as never,
      });
      break;
    }
    case "DONE": {
      if (getSidebarTodo("audit")?.status === "analyzing") {
        updateSidebarTodo("audit", {
          status: "done",
          detail: "File audit complete",
        });
      }
      if (getSidebarTodo("validate")?.status === "analyzing") {
        updateSidebarTodo("validate", {
          status: "done",
          detail: "Validation complete",
        });
      }
      if (sidebarWorkflowState && sidebarWorkflowState.status === "analyzing") {
        sidebarWorkflowState = {
          ...sidebarWorkflowState,
          status: "done",
        };
        syncWorkflowState(sidebarProvider);
      }
      syncSidebarTodos(sidebarProvider);
      vscode.window.showInformationMessage("Codea11y: Audit complete!");
      break;
    }
    case "ERROR": {
      const message = String((evt.data as { message?: string }).message || "Unknown error");
      if (sidebarWorkflowState) {
        sidebarWorkflowState = {
          ...sidebarWorkflowState,
          status: "error",
          detail: message,
        };
        syncWorkflowState(sidebarProvider);
      }
      if (getSidebarTodo("validate")?.status === "analyzing") {
        updateSidebarTodo("validate", {
          status: "error",
          detail: message,
        });
        upsertActivity(sidebarProvider, {
          id: "validation-summary",
          phase: "validate",
          heading: "Final validation",
          status: "error",
          summary: message,
          lines: [],
        });
      } else if (getSidebarTodo("audit")?.status === "analyzing") {
        updateSidebarTodo("audit", {
          status: "error",
          detail: message,
        });
      } else {
        updateSidebarTodo("runtime", {
          status: "error",
          detail: message,
        });
        upsertActivity(sidebarProvider, {
          id: "runtime-analysis",
          phase: "runtime",
          heading: "Runtime analysis",
          status: "error",
          summary: message,
          lines: [],
        });
      }
      syncSidebarTodos(sidebarProvider);
      sidebarProvider.postMessage({
        type: "STREAM_CHAT",
        payload: createAssistantMessage(
          `Audit failed: ${message}`
        ),
      });
      vscode.window.showWarningMessage(`Codea11y: ${message}`);
      break;
    }
  }
}
