import React, { useState, useEffect, useCallback } from "react";
import type {
  ChatSession,
  ExtensionToWebviewMessage,
} from "../../shared/messages";
import { getVsCodeApi, onExtensionMessage } from "../shared/vscodeApi";

/* ===================================================================
 *  Chat List View — shows all previous chats
 * =================================================================== */

interface ChatListViewProps {
  onOpenChat: (chatId: string) => void;
  onNewChat: () => void;
}

export default function ChatListView({ onOpenChat, onNewChat }: ChatListViewProps) {
  const vscodeApi = getVsCodeApi();
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // ── Request the chat list on mount ────────────────────────────
  useEffect(() => {
    vscodeApi.postMessage({ type: "GET_CHAT_LIST" });
  }, [vscodeApi]);

  // ── Listen for extension messages ─────────────────────────────
  useEffect(() => {
    return onExtensionMessage((msg: ExtensionToWebviewMessage) => {
      switch (msg.type) {
        case "CHAT_LIST":
          setChats(msg.payload);
          break;
        case "CHAT_CREATED":
          setChats((prev) => [msg.payload, ...prev]);
          onOpenChat(msg.payload.id);
          break;
        case "CHAT_DELETED":
          setChats((prev) => prev.filter((c) => c.id !== msg.payload.chatId));
          setDeletingId(null);
          break;
        case "CHAT_RENAMED":
          setChats((prev) =>
            prev.map((c) =>
              c.id === msg.payload.chatId ? { ...c, title: msg.payload.title } : c
            )
          );
          setRenamingId(null);
          break;
      }
    });
  }, [onOpenChat]);

  // ── Delete handler ────────────────────────────────────────────
  const handleDelete = useCallback(
    (e: React.MouseEvent, chatId: string) => {
      e.stopPropagation();
      setDeletingId(chatId);
      vscodeApi.postMessage({ type: "DELETE_CHAT", payload: { chatId } });
    },
    [vscodeApi]
  );

  // ── Format relative time ──────────────────────────────────────
  const relativeTime = (isoDate: string) => {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="flex flex-col h-screen">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-vscode-border">
        <h2 className="text-sm font-semibold m-0">Chat History</h2>
        <button
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium
                     bg-vscode-button-bg text-vscode-button-fg
                     hover:bg-vscode-button-hover transition-colors"
          onClick={onNewChat}
          title="New Chat"
        >
          <span className="codicon codicon-add" />
          New Chat
        </button>
      </div>

      {/* ── Chat List ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-50 px-4">
            <span className="codicon codicon-comment-discussion text-3xl mb-2" />
            <p className="text-sm text-center">No chats yet.</p>
            <p className="text-xs text-center mt-1">
              Start a new chat to ask about WCAG compliance.
            </p>
          </div>
        ) : (
          <ul className="list-none m-0 p-0">
            {chats.map((chat) => (
              <li
                key={chat.id}
                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer
                           border-b border-vscode-border
                           hover:bg-vscode-list-hover transition-colors group"
                onClick={() => onOpenChat(chat.id)}
              >
                {/* Icon */}
                <span className="codicon codicon-comment shrink-0 opacity-60" />

                {/* Text content */}
                <div className="flex-1 min-w-0">
                  {renamingId === chat.id ? (
                    <input
                      className="text-sm font-medium m-0 w-full bg-vscode-input-bg
                                 text-vscode-input-fg border border-vscode-input-border
                                 rounded px-1.5 py-0.5 outline-none
                                 focus:border-vscode-button-bg"
                      value={renameValue}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => {
                        const trimmed = renameValue.trim();
                        if (trimmed && trimmed !== chat.title) {
                          vscodeApi.postMessage({ type: "RENAME_CHAT", payload: { chatId: chat.id, title: trimmed } });
                        }
                        setRenamingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                    />
                  ) : (
                    <p className="text-sm font-medium truncate m-0">
                      {chat.title}
                    </p>
                  )}
                  <p className="text-xs opacity-50 m-0 mt-0.5">
                    {chat.messageCount} message{chat.messageCount !== 1 ? "s" : ""}
                    {" · "}
                    {relativeTime(chat.updatedAt)}
                  </p>
                </div>

                {/* Rename button */}
                <button
                  className="shrink-0 p-1 rounded opacity-50 hover:opacity-100
                             hover:bg-vscode-input-bg transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenamingId(chat.id);
                    setRenameValue(chat.title);
                  }}
                  title="Rename chat"
                >
                  <span className="codicon codicon-edit" />
                </button>

                {/* Delete button */}
                <button
                  className="shrink-0 p-1 rounded opacity-50 hover:opacity-100
                             hover:bg-vscode-input-bg transition-opacity"
                  onClick={(e) => handleDelete(e, chat.id)}
                  disabled={deletingId === chat.id}
                  title="Delete chat"
                >
                  <span
                    className={`codicon ${
                      deletingId === chat.id
                        ? "codicon-loading codicon-modifier-spin"
                        : "codicon-trash"
                    }`}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
