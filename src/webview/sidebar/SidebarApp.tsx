import React, { useState, useCallback, useEffect } from "react";
import type { AuthStatePayload, ExtensionToWebviewMessage } from "../../shared/messages";
import { getVsCodeApi, onExtensionMessage } from "../shared/vscodeApi";
import ChatListView from "./ChatListView";
import ChatView from "./ChatView";
import LoginView from "./LoginView";

/* ===================================================================
 *  SidebarApp — top-level router between Chat List and Chat views
 * =================================================================== */

type Screen =
  | { view: "list" }
  | { view: "chat"; chatId: string; title: string };

export default function SidebarApp() {
  const vscodeApi = getVsCodeApi();
  const [screen, setScreen] = useState<Screen>({ view: "list" });
  const [authState, setAuthState] = useState<AuthStatePayload>({
    status: "checking",
    serverBaseUrl: "",
  });

  useEffect(() => {
    vscodeApi.postMessage({ type: "GET_AUTH_STATE" });
  }, [vscodeApi]);

  // ── Listen for CHAT_OPENED / CHAT_RENAMED ────────────────────────
  useEffect(() => {
    return onExtensionMessage((msg: ExtensionToWebviewMessage) => {
      if (msg.type === "AUTH_STATE") {
        setAuthState(msg.payload);
        if (msg.payload.status !== "authenticated") {
          setScreen({ view: "list" });
        }
      }
      if (msg.type === "CHAT_OPENED" && authState.status === "authenticated") {
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
  }, [authState.status, screen]);

  const handleLogin = useCallback(
    (email: string, password: string) => {
      vscodeApi.postMessage({ type: "LOGIN_REQUEST", payload: { email, password } });
    },
    [vscodeApi]
  );

  const handleLogout = useCallback(() => {
    vscodeApi.postMessage({ type: "LOGOUT" });
  }, [vscodeApi]);

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

  if (authState.status !== "authenticated") {
    return <LoginView authState={authState} onLogin={handleLogin} />;
  }

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
    <ChatListView onOpenChat={handleOpenChat} onNewChat={handleNewChat} onLogout={handleLogout} />
  );
}
