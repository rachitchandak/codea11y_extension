import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatActivityItem,
  ChatMessage,
  ChatTranscriptItem,
  ExtensionToWebviewMessage,
  TodoItem,
  TodoStatus,
} from "../../shared/messages";
import { getVsCodeApi, onExtensionMessage } from "../shared/vscodeApi";

interface ChatViewProps {
  chatId: string;
  chatTitle: string;
  onBack: () => void;
  onTitleChanged: (chatId: string, newTitle: string) => void;
}

const statusIcon: Record<TodoStatus, string> = {
  pending: "codicon-circle-outline",
  analyzing: "codicon-loading codicon-modifier-spin",
  done: "codicon-check",
  error: "codicon-error",
  skipped: "codicon-circle-slash",
};

const statusToneClass: Record<TodoStatus, string> = {
  pending: "opacity-70",
  analyzing: "text-vscode-button-bg",
  done: "text-green-400",
  error: "text-red-400",
  skipped: "opacity-60",
};

function TodoPanel({ tasks }: { tasks: TodoItem[] }) {
  const [open, setOpen] = useState(true);

  return (
    <section className="mx-3 rounded-2xl border border-vscode-border bg-vscode-editor-background">
      <button
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide hover:bg-vscode-list-hover transition-colors"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span>Workflow Todos ({tasks.length})</span>
        <span
          className={`codicon ${open ? "codicon-chevron-up" : "codicon-chevron-down"}`}
        />
      </button>

      <div className="collapsible-content" data-state={open ? "open" : "closed"}>
        {tasks.length === 0 ? (
          <p className="px-3 py-2 text-xs opacity-60">No workflow todos</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-start gap-2 px-3 py-2 text-xs">
                <span className={`codicon mt-0.5 ${statusIcon[task.status]}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{task.title}</span>
                    {task.countLabel && (
                      <span className="shrink-0 opacity-70">{task.countLabel}</span>
                    )}
                  </div>
                  {task.detail && (
                    <p className="mb-0 mt-0.5 truncate opacity-70">{task.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";

  return (
    <div className={isUser ? "ml-10" : "mr-6"}>
      <div
        className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
          isUser ? "bg-vscode-input-bg" : "border border-vscode-border"
        }`}
      >
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide opacity-60">
          {isUser ? "You" : "Codea11y"}
        </span>
        {msg.content}
        {msg.isStreaming && <span className="ml-1 inline-block animate-pulse">▌</span>}
      </div>
    </div>
  );
}

function ActivityCard({
  item,
  collapsed,
  onToggle,
}: {
  item: ChatActivityItem;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mr-6 rounded-xl border border-vscode-border bg-vscode-input-bg">
      <button
        className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-vscode-list-hover transition-colors"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <span className={`codicon mt-0.5 ${statusIcon[item.status]} ${statusToneClass[item.status]}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{item.heading}</div>
              <div className="mt-0.5 text-xs opacity-65">Codea11y</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {item.countLabel && (
                <span className="rounded-full border border-vscode-border px-2 py-0.5 text-[11px] opacity-75">
                  {item.countLabel}
                </span>
              )}
              <span
                className={`codicon ${collapsed ? "codicon-chevron-down" : "codicon-chevron-up"}`}
              />
            </div>
          </div>
        </div>
      </button>

      <div className="collapsible-content px-3 pb-3" data-state={collapsed ? "closed" : "open"}>
        {item.summary && <p className="m-0 text-sm opacity-85">{item.summary}</p>}
        {item.lines.length > 0 && (
          <ul className="m-0 mt-2 list-none space-y-1 p-0 text-xs opacity-75">
            {item.lines.map((line) => (
              <li key={line.id} className="leading-5">
                {line.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function upsertTranscriptItem<T extends ChatTranscriptItem>(
  items: ChatTranscriptItem[],
  nextItem: T
): ChatTranscriptItem[] {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index >= 0) {
    const updated = [...items];
    updated[index] = nextItem;
    return updated;
  }
  return [...items, nextItem];
}

export default function ChatView({ chatId, chatTitle, onBack, onTitleChanged }: ChatViewProps) {
  const vscodeApi = getVsCodeApi();

  const [tasks, setTasks] = useState<TodoItem[]>([]);
  const [transcript, setTranscript] = useState<ChatTranscriptItem[]>([]);
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(chatTitle);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return onExtensionMessage((msg: ExtensionToWebviewMessage) => {
      switch (msg.type) {
        case "UPDATE_WORKFLOW":
          break;
        case "UPDATE_TODO":
          setTasks(msg.payload);
          break;
        case "RESET_CHAT_ACTIVITY":
          setTranscript((prev) => prev.filter((item) => item.kind === "message"));
          setCollapsedCards({});
          break;
        case "UPSERT_CHAT_ACTIVITY": {
          let previousStatus: TodoStatus | undefined;
          setTranscript((prev) => {
            const existing = prev.find((item) => item.id === msg.payload.id);
            if (existing && existing.kind === "activity") {
              previousStatus = existing.status;
            }
            return upsertTranscriptItem(prev, msg.payload);
          });
          setCollapsedCards((prev) => {
            if (prev[msg.payload.id] !== undefined) {
              return prev;
            }

            const shouldCollapse =
              msg.payload.autoCollapseOnDone &&
              ["done", "error", "skipped"].includes(msg.payload.status) &&
              previousStatus !== msg.payload.status;

            return shouldCollapse ? { ...prev, [msg.payload.id]: true } : prev;
          });
          break;
        }
        case "STREAM_CHAT":
          setTranscript((prev) => upsertTranscriptItem(prev, msg.payload));
          break;
        case "CHAT_OPENED":
          if (msg.payload.chatId === chatId) {
            setTranscript(msg.payload.messages);
            setCollapsedCards({});
          }
          break;
      }
    });
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }

    const userMessage: ChatMessage = {
      kind: "message",
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    setTranscript((prev) => [...prev, userMessage]);
    setInput("");
    vscodeApi.postMessage({ type: "SEND_QUERY", payload: { query: trimmed, chatId } });
  }, [chatId, input, vscodeApi]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center gap-2 border-b border-vscode-border px-3 py-2">
        <button
          className="shrink-0 rounded p-1 hover:bg-vscode-list-hover transition-colors"
          onClick={onBack}
          title="Back to chat list"
        >
          <span className="codicon codicon-arrow-left" />
        </button>

        {isEditing ? (
          <input
            ref={titleInputRef}
            className="m-0 flex-1 rounded border border-vscode-input-border bg-vscode-input-bg px-1.5 py-0.5 text-sm font-semibold text-vscode-input-fg outline-none focus:border-vscode-button-bg"
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            onBlur={() => {
              const trimmed = editTitle.trim();
              if (trimmed && trimmed !== chatTitle) {
                vscodeApi.postMessage({ type: "RENAME_CHAT", payload: { chatId, title: trimmed } });
                onTitleChanged(chatId, trimmed);
              } else {
                setEditTitle(chatTitle);
              }
              setIsEditing(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                (event.target as HTMLInputElement).blur();
              }
              if (event.key === "Escape") {
                setEditTitle(chatTitle);
                setIsEditing(false);
              }
            }}
          />
        ) : (
          <h2
            className="m-0 flex-1 cursor-pointer truncate text-sm font-semibold hover:opacity-70 transition-opacity"
            onClick={() => {
              setIsEditing(true);
              setTimeout(() => titleInputRef.current?.select(), 0);
            }}
            title="Click to rename"
          >
            {chatTitle}
          </h2>
        )}

        <button
          className="shrink-0 rounded p-1 opacity-50 hover:bg-vscode-list-hover hover:opacity-100 transition-all"
          onClick={() => {
            setIsEditing(true);
            setTimeout(() => titleInputRef.current?.select(), 0);
          }}
          title="Rename chat"
        >
          <span className="codicon codicon-edit" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto py-3">
        {transcript.length === 0 && (
          <p className="mt-8 px-3 text-center text-sm opacity-50">
            Ask a question about accessibility…
          </p>
        )}

        {transcript.map((item) =>
          item.kind === "message" ? (
            <MessageBubble key={item.id} msg={item} />
          ) : (
            <ActivityCard
              key={item.id}
              item={item}
              collapsed={collapsedCards[item.id] ?? false}
              onToggle={() =>
                setCollapsedCards((prev) => ({
                  ...prev,
                  [item.id]: !(prev[item.id] ?? false),
                }))
              }
            />
          )
        )}
        <div ref={bottomRef} />
      </div>

      <TodoPanel tasks={tasks} />

      <div className="flex items-end gap-2 border-t border-vscode-border p-2">
        <textarea
          className="min-h-[36px] max-h-[120px] flex-1 resize-none rounded border border-vscode-input-border bg-vscode-input-bg px-2 py-1.5 text-sm text-vscode-input-fg outline-none focus:border-vscode-button-bg"
          rows={1}
          placeholder="Ask about WCAG compliance…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="rounded bg-vscode-button-bg px-3 py-1.5 text-sm font-medium text-vscode-button-fg hover:bg-vscode-button-hover transition-colors disabled:opacity-40"
          disabled={!input.trim()}
          onClick={handleSend}
        >
          Send
        </button>
      </div>
    </div>
  );
}
