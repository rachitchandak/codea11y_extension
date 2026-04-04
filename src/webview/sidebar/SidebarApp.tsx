import React, { useState, useCallback, useEffect } from "react";
import type { ExtensionToWebviewMessage } from "../../shared/messages";
import { getVsCodeApi, onExtensionMessage } from "../shared/vscodeApi";
import ChatListView from "./ChatListView";
import ChatView from "./ChatView";

/* ===================================================================
 *  SidebarApp — top-level router between Chat List and Chat views
 * =================================================================== */

type Screen =
  | { view: "list" }
  | { view: "chat"; chatId: string; title: string };

export default function SidebarApp() {
  const vscodeApi = getVsCodeApi();
  const [screen, setScreen] = useState<Screen>({ view: "list" });

  // ── Listen for CHAT_OPENED / CHAT_RENAMED ────────────────────────
  useEffect(() => {
    return onExtensionMessage((msg: ExtensionToWebviewMessage) => {
      if (msg.type === "CHAT_OPENED") {
        setScreen({
          view: "chat",
          chatId: msg.payload.chatId,
          title: msg.payload.title,
        });
      }
      if (msg.type === "CHAT_RENAMED" && screen.view === "chat" && screen.chatId === msg.payload.chatId) {
        setScreen((prev) =>
          prev.view === "chat" ? { ...prev, title: msg.payload.title } : prev
        );
      }
    });
  }, [screen]);

  // ── Navigation callbacks ──────────────────────────────────────
  const handleOpenChat = useCallback(
    (chatId: string) => {
      vscodeApi.postMessage({ type: "OPEN_CHAT", payload: { chatId } });
    },
    [vscodeApi]
  );

  const handleNewChat = useCallback(() => {
    vscodeApi.postMessage({ type: "CREATE_CHAT" });
  }, [vscodeApi]);

  const handleBack = useCallback(() => {
    setScreen({ view: "list" });
    // Refresh the list when navigating back
    vscodeApi.postMessage({ type: "GET_CHAT_LIST" });
  }, [vscodeApi]);

  const handleTitleChanged = useCallback(
    (chatId: string, newTitle: string) => {
      setScreen((prev) =>
        prev.view === "chat" && prev.chatId === chatId
          ? { ...prev, title: newTitle }
          : prev
      );
    },
    []
  );

  // ── Render ────────────────────────────────────────────────────
  if (screen.view === "chat") {
    return (
      <ChatView
        chatId={screen.chatId}
        chatTitle={screen.title}
        onBack={handleBack}
        onTitleChanged={handleTitleChanged}
      />
    );
  }

  return (
    <ChatListView onOpenChat={handleOpenChat} onNewChat={handleNewChat} />
  );
}
