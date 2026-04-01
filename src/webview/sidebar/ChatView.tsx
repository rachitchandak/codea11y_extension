import React, { useState, useRef, useEffect, useCallback } from "react";
import type {
  TodoItem,
  ChatMessage,
  ExtensionToWebviewMessage,
} from "../../shared/messages";
import { getVsCodeApi, onExtensionMessage } from "../shared/vscodeApi";

/* ===================================================================
 *  Props for ChatView (receives context from SidebarApp)
 * =================================================================== */

interface ChatViewProps {
  chatId: string;
  chatTitle: string;
  onBack: () => void;
  onTitleChanged: (chatId: string, newTitle: string) => void;
}

/* ===================================================================
 *  Active Tasks (TO-DO) Panel – collapsible
 * =================================================================== */

const statusIcon: Record<TodoItem["status"], string> = {
  pending: "codicon-circle-outline",
  analyzing: "codicon-loading codicon-modifier-spin",
  done: "codicon-check",
  error: "codicon-error",
  skipped: "codicon-circle-slash",
};

function ActiveTasksPanel({ tasks }: { tasks: TodoItem[] }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border-b border-vscode-border">
      {/* header / toggle */}
      <button
        className="flex w-full items-center justify-between px-3 py-2
                   text-xs font-semibold uppercase tracking-wide
                   hover:bg-vscode-list-hover transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>Active Tasks ({tasks.length})</span>
        <span
          className={`codicon ${
            open ? "codicon-chevron-up" : "codicon-chevron-down"
          }`}
        />
      </button>

      {/* collapsible body */}
      <div
        className="collapsible-content"
        data-state={open ? "open" : "closed"}
      >
        {tasks.length === 0 ? (
          <p className="px-3 py-2 text-xs opacity-60">No active tasks</p>
        ) : (
          <ul className="list-none m-0 p-0">
            {tasks.map((t) => (
              <li
                key={t.filePath}
                className="flex items-center gap-2 px-3 py-1.5 text-xs"
              >
                <span className={`codicon ${statusIcon[t.status]}`} />
                <span className="truncate flex-1">
                  {t.message ?? t.filePath}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ===================================================================
 *  Progress bar
 * =================================================================== */

function ProgressBar({
  percent,
  label,
}: {
  percent: number;
  label: string;
}) {
  if (percent <= 0) return null;

  return (
    <div className="px-3 py-2 border-b border-vscode-border">
      <div className="flex items-center justify-between text-xs mb-1">
        <span>{label}</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div className="h-1 w-full rounded bg-vscode-input-bg overflow-hidden">
        <div
          className="h-full bg-vscode-button-bg transition-all duration-300"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

/* ===================================================================
 *  Chat message bubble
 * =================================================================== */

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div
      className={`px-3 py-2 text-sm whitespace-pre-wrap ${
        isUser ? "bg-vscode-input-bg rounded-lg ml-8" : "mr-8"
      }`}
    >
      <span className="font-semibold text-xs block mb-0.5 opacity-70">
        {isUser ? "You" : "Codea11y"}
      </span>
      {msg.content}
      {msg.isStreaming && (
        <span className="inline-block ml-1 animate-pulse">▌</span>
      )}
    </div>
  );
}

/* ===================================================================
 *  Main ChatView
 * =================================================================== */

export default function ChatView({ chatId, chatTitle, onBack, onTitleChanged }: ChatViewProps) {
  const vscodeApi = getVsCodeApi();

  const [tasks, setTasks] = useState<TodoItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [progress, setProgress] = useState({ percent: 0, label: "" });
  const [input, setInput] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(chatTitle);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Listen for extension messages ─────────────────────────────
  useEffect(() => {
    return onExtensionMessage((msg: ExtensionToWebviewMessage) => {
      switch (msg.type) {
        case "UPDATE_TODO":
          setTasks(msg.payload);
          break;
        case "STREAM_CHAT":
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === msg.payload.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = msg.payload;
              return updated;
            }
            return [...prev, msg.payload];
          });
          break;
        case "SET_PROGRESS":
          setProgress(msg.payload);
          break;
        case "CHAT_OPENED":
          // Load history when a chat is opened
          if (msg.payload.chatId === chatId) {
            setMessages(msg.payload.messages);
          }
          break;
      }
    });
  }, [chatId]);

  // ── Auto-scroll on new messages ───────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send query ────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Optimistically show the user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    vscodeApi.postMessage({ type: "SEND_QUERY", payload: { query: trimmed, chatId } });
  }, [input, vscodeApi, chatId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* ── Chat Header with back button & editable title ───────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-vscode-border">
        <button
          className="shrink-0 p-1 rounded hover:bg-vscode-list-hover transition-colors"
          onClick={onBack}
          title="Back to chat list"
        >
          <span className="codicon codicon-arrow-left" />
        </button>

        {isEditing ? (
          <input
            ref={titleInputRef}
            className="flex-1 text-sm font-semibold m-0 bg-vscode-input-bg
                       text-vscode-input-fg border border-vscode-input-border
                       rounded px-1.5 py-0.5 outline-none
                       focus:border-vscode-button-bg"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
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
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") { setEditTitle(chatTitle); setIsEditing(false); }
            }}
          />
        ) : (
          <h2
            className="text-sm font-semibold m-0 truncate flex-1 cursor-pointer
                       hover:opacity-70 transition-opacity"
            onClick={() => { setIsEditing(true); setTimeout(() => titleInputRef.current?.select(), 0); }}
            title="Click to rename"
          >
            {chatTitle}
          </h2>
        )}

        <button
          className="shrink-0 p-1 rounded opacity-50 hover:opacity-100
                     hover:bg-vscode-list-hover transition-all"
          onClick={() => { setIsEditing(true); setTimeout(() => titleInputRef.current?.select(), 0); }}
          title="Rename chat"
        >
          <span className="codicon codicon-edit" />
        </button>
      </div>

      {/* ── Progress ────────────────────────────────────────────── */}
      <ProgressBar percent={progress.percent} label={progress.label} />

      {/* ── Message List ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto space-y-3 py-3">
        {messages.length === 0 && (
          <p className="px-3 text-sm opacity-50 text-center mt-8">
            Ask a question about accessibility…
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Active Tasks Panel (above input) */}
      <ActiveTasksPanel tasks={tasks} />

      {/* Input Area */}
      <div className="border-t border-vscode-border p-2 flex gap-2 items-end">
        <textarea
          className="flex-1 resize-none rounded border border-vscode-input-border
                     bg-vscode-input-bg text-vscode-input-fg px-2 py-1.5
                     text-sm outline-none focus:border-vscode-button-bg
                     min-h-[36px] max-h-[120px]"
          rows={1}
          placeholder="Ask about WCAG compliance…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="px-3 py-1.5 rounded text-sm font-medium
                     bg-vscode-button-bg text-vscode-button-fg
                     hover:bg-vscode-button-hover transition-colors
                     disabled:opacity-40"
          disabled={!input.trim()}
          onClick={handleSend}
        >
          Send
        </button>
      </div>
    </div>
  );
}
