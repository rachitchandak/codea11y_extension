/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/webview/shared/vscodeApi.ts"
/*!*****************************************!*\
  !*** ./src/webview/shared/vscodeApi.ts ***!
  \*****************************************/
(__unused_webpack_module, exports) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getVsCodeApi = getVsCodeApi;
exports.onExtensionMessage = onExtensionMessage;
// Singleton
let _api;
function getVsCodeApi() {
    if (!_api) {
        _api = acquireVsCodeApi();
    }
    return _api;
}
/**
 * Subscribe to messages coming FROM the extension host.
 * Returns an unsubscribe function.
 */
function onExtensionMessage(handler) {
    const listener = (event) => {
        handler(event.data);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
}


/***/ },

/***/ "./src/webview/sidebar/ChatListView.tsx"
/*!**********************************************!*\
  !*** ./src/webview/sidebar/ChatListView.tsx ***!
  \**********************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports["default"] = ChatListView;
const jsx_runtime_1 = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'react/jsx-runtime'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
const react_1 = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'react'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
const vscodeApi_1 = __webpack_require__(/*! ../shared/vscodeApi */ "./src/webview/shared/vscodeApi.ts");
function ChatListView({ onOpenChat, onNewChat }) {
    const vscodeApi = (0, vscodeApi_1.getVsCodeApi)();
    const [chats, setChats] = (0, react_1.useState)([]);
    const [deletingId, setDeletingId] = (0, react_1.useState)(null);
    const [renamingId, setRenamingId] = (0, react_1.useState)(null);
    const [renameValue, setRenameValue] = (0, react_1.useState)("");
    // ── Request the chat list on mount ────────────────────────────
    (0, react_1.useEffect)(() => {
        vscodeApi.postMessage({ type: "GET_CHAT_LIST" });
    }, [vscodeApi]);
    // ── Listen for extension messages ─────────────────────────────
    (0, react_1.useEffect)(() => {
        return (0, vscodeApi_1.onExtensionMessage)((msg) => {
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
                    setChats((prev) => prev.map((c) => c.id === msg.payload.chatId ? { ...c, title: msg.payload.title } : c));
                    setRenamingId(null);
                    break;
            }
        });
    }, [onOpenChat]);
    // ── Delete handler ────────────────────────────────────────────
    const handleDelete = (0, react_1.useCallback)((e, chatId) => {
        e.stopPropagation();
        setDeletingId(chatId);
        vscodeApi.postMessage({ type: "DELETE_CHAT", payload: { chatId } });
    }, [vscodeApi]);
    // ── Format relative time ──────────────────────────────────────
    const relativeTime = (isoDate) => {
        const diff = Date.now() - new Date(isoDate).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1)
            return "just now";
        if (mins < 60)
            return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24)
            return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col h-screen", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between px-3 py-2 border-b border-vscode-border", children: [(0, jsx_runtime_1.jsx)("h2", { className: "text-sm font-semibold m-0", children: "Chat History" }), (0, jsx_runtime_1.jsxs)("button", { className: "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium\r\n                     bg-vscode-button-bg text-vscode-button-fg\r\n                     hover:bg-vscode-button-hover transition-colors", onClick: onNewChat, title: "New Chat", children: [(0, jsx_runtime_1.jsx)("span", { className: "codicon codicon-add" }), "New Chat"] })] }), (0, jsx_runtime_1.jsx)("div", { className: "flex-1 overflow-y-auto", children: chats.length === 0 ? ((0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col items-center justify-center h-full opacity-50 px-4", children: [(0, jsx_runtime_1.jsx)("span", { className: "codicon codicon-comment-discussion text-3xl mb-2" }), (0, jsx_runtime_1.jsx)("p", { className: "text-sm text-center", children: "No chats yet." }), (0, jsx_runtime_1.jsx)("p", { className: "text-xs text-center mt-1", children: "Start a new chat to ask about WCAG compliance." })] })) : ((0, jsx_runtime_1.jsx)("ul", { className: "list-none m-0 p-0", children: chats.map((chat) => ((0, jsx_runtime_1.jsxs)("li", { className: "flex items-center gap-2 px-3 py-2.5 cursor-pointer\r\n                           border-b border-vscode-border\r\n                           hover:bg-vscode-list-hover transition-colors group", onClick: () => onOpenChat(chat.id), children: [(0, jsx_runtime_1.jsx)("span", { className: "codicon codicon-comment shrink-0 opacity-60" }), (0, jsx_runtime_1.jsxs)("div", { className: "flex-1 min-w-0", children: [renamingId === chat.id ? ((0, jsx_runtime_1.jsx)("input", { className: "text-sm font-medium m-0 w-full bg-vscode-input-bg\r\n                                 text-vscode-input-fg border border-vscode-input-border\r\n                                 rounded px-1.5 py-0.5 outline-none\r\n                                 focus:border-vscode-button-bg", value: renameValue, autoFocus: true, onClick: (e) => e.stopPropagation(), onChange: (e) => setRenameValue(e.target.value), onBlur: () => {
                                            const trimmed = renameValue.trim();
                                            if (trimmed && trimmed !== chat.title) {
                                                vscodeApi.postMessage({ type: "RENAME_CHAT", payload: { chatId: chat.id, title: trimmed } });
                                            }
                                            setRenamingId(null);
                                        }, onKeyDown: (e) => {
                                            if (e.key === "Enter")
                                                e.target.blur();
                                            if (e.key === "Escape")
                                                setRenamingId(null);
                                        } })) : ((0, jsx_runtime_1.jsx)("p", { className: "text-sm font-medium truncate m-0", children: chat.title })), (0, jsx_runtime_1.jsxs)("p", { className: "text-xs opacity-50 m-0 mt-0.5", children: [chat.messageCount, " message", chat.messageCount !== 1 ? "s" : "", " · ", relativeTime(chat.updatedAt)] })] }), (0, jsx_runtime_1.jsx)("button", { className: "shrink-0 p-1 rounded opacity-50 hover:opacity-100\r\n                             hover:bg-vscode-input-bg transition-opacity", onClick: (e) => {
                                    e.stopPropagation();
                                    setRenamingId(chat.id);
                                    setRenameValue(chat.title);
                                }, title: "Rename chat", children: (0, jsx_runtime_1.jsx)("span", { className: "codicon codicon-edit" }) }), (0, jsx_runtime_1.jsx)("button", { className: "shrink-0 p-1 rounded opacity-50 hover:opacity-100\r\n                             hover:bg-vscode-input-bg transition-opacity", onClick: (e) => handleDelete(e, chat.id), disabled: deletingId === chat.id, title: "Delete chat", children: (0, jsx_runtime_1.jsx)("span", { className: `codicon ${deletingId === chat.id
                                        ? "codicon-loading codicon-modifier-spin"
                                        : "codicon-trash"}` }) })] }, chat.id))) })) })] }));
}


/***/ },

/***/ "./src/webview/sidebar/ChatView.tsx"
/*!******************************************!*\
  !*** ./src/webview/sidebar/ChatView.tsx ***!
  \******************************************/
(__unused_webpack_module, exports, __webpack_require__) {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports["default"] = ChatView;
const jsx_runtime_1 = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'react/jsx-runtime'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
const react_1 = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'react'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
const vscodeApi_1 = __webpack_require__(/*! ../shared/vscodeApi */ "./src/webview/shared/vscodeApi.ts");
const statusIcon = {
    pending: "codicon-circle-outline",
    analyzing: "codicon-loading codicon-modifier-spin",
    done: "codicon-check",
    error: "codicon-error",
    skipped: "codicon-circle-slash",
};
const statusToneClass = {
    pending: "opacity-70",
    analyzing: "text-vscode-button-bg",
    done: "text-green-400",
    error: "text-red-400",
    skipped: "opacity-60",
};
function TodoPanel({ tasks }) {
    const [open, setOpen] = (0, react_1.useState)(true);
    return ((0, jsx_runtime_1.jsxs)("section", { className: "mx-3 rounded-2xl border border-vscode-border bg-vscode-editor-background", children: [(0, jsx_runtime_1.jsxs)("button", { className: "flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide hover:bg-vscode-list-hover transition-colors", onClick: () => setOpen((current) => !current), "aria-expanded": open, children: [(0, jsx_runtime_1.jsxs)("span", { children: ["Workflow Todos (", tasks.length, ")"] }), (0, jsx_runtime_1.jsx)("span", { className: `codicon ${open ? "codicon-chevron-up" : "codicon-chevron-down"}` })] }), (0, jsx_runtime_1.jsx)("div", { className: "collapsible-content", "data-state": open ? "open" : "closed", children: tasks.length === 0 ? ((0, jsx_runtime_1.jsx)("p", { className: "px-3 py-2 text-xs opacity-60", children: "No workflow todos" })) : ((0, jsx_runtime_1.jsx)("ul", { className: "m-0 list-none p-0", children: tasks.map((task) => ((0, jsx_runtime_1.jsxs)("li", { className: "flex items-start gap-2 px-3 py-2 text-xs", children: [(0, jsx_runtime_1.jsx)("span", { className: `codicon mt-0.5 ${statusIcon[task.status]}` }), (0, jsx_runtime_1.jsxs)("div", { className: "min-w-0 flex-1", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between gap-2", children: [(0, jsx_runtime_1.jsx)("span", { className: "truncate font-medium", children: task.title }), task.countLabel && ((0, jsx_runtime_1.jsx)("span", { className: "shrink-0 opacity-70", children: task.countLabel }))] }), task.detail && ((0, jsx_runtime_1.jsx)("p", { className: "mb-0 mt-0.5 truncate opacity-70", children: task.detail }))] })] }, task.id))) })) })] }));
}
function MessageBubble({ msg }) {
    const isUser = msg.role === "user";
    return ((0, jsx_runtime_1.jsx)("div", { className: isUser ? "ml-10" : "mr-6", children: (0, jsx_runtime_1.jsxs)("div", { className: `rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${isUser ? "bg-vscode-input-bg" : "border border-vscode-border"}`, children: [(0, jsx_runtime_1.jsx)("span", { className: "mb-1 block text-[11px] font-semibold uppercase tracking-wide opacity-60", children: isUser ? "You" : "Codea11y" }), msg.content, msg.isStreaming && (0, jsx_runtime_1.jsx)("span", { className: "ml-1 inline-block animate-pulse", children: "\u258C" })] }) }));
}
function ActivityCard({ item, collapsed, onToggle, }) {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "mr-6 rounded-xl border border-vscode-border bg-vscode-input-bg", children: [(0, jsx_runtime_1.jsxs)("button", { className: "flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-vscode-list-hover transition-colors", onClick: onToggle, "aria-expanded": !collapsed, children: [(0, jsx_runtime_1.jsx)("span", { className: `codicon mt-0.5 ${statusIcon[item.status]} ${statusToneClass[item.status]}` }), (0, jsx_runtime_1.jsx)("div", { className: "min-w-0 flex-1", children: (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between gap-3", children: [(0, jsx_runtime_1.jsxs)("div", { className: "min-w-0", children: [(0, jsx_runtime_1.jsx)("div", { className: "truncate text-sm font-semibold", children: item.heading }), (0, jsx_runtime_1.jsx)("div", { className: "mt-0.5 text-xs opacity-65", children: "Codea11y" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex shrink-0 items-center gap-2", children: [item.countLabel && ((0, jsx_runtime_1.jsx)("span", { className: "rounded-full border border-vscode-border px-2 py-0.5 text-[11px] opacity-75", children: item.countLabel })), (0, jsx_runtime_1.jsx)("span", { className: `codicon ${collapsed ? "codicon-chevron-down" : "codicon-chevron-up"}` })] })] }) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "collapsible-content px-3 pb-3", "data-state": collapsed ? "closed" : "open", children: [item.summary && (0, jsx_runtime_1.jsx)("p", { className: "m-0 text-sm opacity-85", children: item.summary }), item.lines.length > 0 && ((0, jsx_runtime_1.jsx)("ul", { className: "m-0 mt-2 list-none space-y-1 p-0 text-xs opacity-75", children: item.lines.map((line) => ((0, jsx_runtime_1.jsx)("li", { className: "leading-5", children: line.text }, line.id))) }))] })] }));
}
function upsertTranscriptItem(items, nextItem) {
    const index = items.findIndex((item) => item.id === nextItem.id);
    if (index >= 0) {
        const updated = [...items];
        updated[index] = nextItem;
        return updated;
    }
    return [...items, nextItem];
}
function ChatView({ chatId, chatTitle, onBack, onTitleChanged }) {
    const vscodeApi = (0, vscodeApi_1.getVsCodeApi)();
    const [tasks, setTasks] = (0, react_1.useState)([]);
    const [transcript, setTranscript] = (0, react_1.useState)([]);
    const [collapsedCards, setCollapsedCards] = (0, react_1.useState)({});
    const [input, setInput] = (0, react_1.useState)("");
    const [isEditing, setIsEditing] = (0, react_1.useState)(false);
    const [editTitle, setEditTitle] = (0, react_1.useState)(chatTitle);
    const titleInputRef = (0, react_1.useRef)(null);
    const bottomRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        return (0, vscodeApi_1.onExtensionMessage)((msg) => {
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
                    let previousStatus;
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
                        const shouldCollapse = msg.payload.autoCollapseOnDone &&
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
    (0, react_1.useEffect)(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [transcript]);
    const handleSend = (0, react_1.useCallback)(() => {
        const trimmed = input.trim();
        if (!trimmed) {
            return;
        }
        const userMessage = {
            kind: "message",
            id: `user-${Date.now()}`,
            role: "user",
            content: trimmed,
        };
        setTranscript((prev) => [...prev, userMessage]);
        setInput("");
        vscodeApi.postMessage({ type: "SEND_QUERY", payload: { query: trimmed, chatId } });
    }, [chatId, input, vscodeApi]);
    const handleKeyDown = (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSend();
        }
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex h-screen flex-col", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 border-b border-vscode-border px-3 py-2", children: [(0, jsx_runtime_1.jsx)("button", { className: "shrink-0 rounded p-1 hover:bg-vscode-list-hover transition-colors", onClick: onBack, title: "Back to chat list", children: (0, jsx_runtime_1.jsx)("span", { className: "codicon codicon-arrow-left" }) }), isEditing ? ((0, jsx_runtime_1.jsx)("input", { ref: titleInputRef, className: "m-0 flex-1 rounded border border-vscode-input-border bg-vscode-input-bg px-1.5 py-0.5 text-sm font-semibold text-vscode-input-fg outline-none focus:border-vscode-button-bg", value: editTitle, onChange: (event) => setEditTitle(event.target.value), onBlur: () => {
                            const trimmed = editTitle.trim();
                            if (trimmed && trimmed !== chatTitle) {
                                vscodeApi.postMessage({ type: "RENAME_CHAT", payload: { chatId, title: trimmed } });
                                onTitleChanged(chatId, trimmed);
                            }
                            else {
                                setEditTitle(chatTitle);
                            }
                            setIsEditing(false);
                        }, onKeyDown: (event) => {
                            if (event.key === "Enter") {
                                event.target.blur();
                            }
                            if (event.key === "Escape") {
                                setEditTitle(chatTitle);
                                setIsEditing(false);
                            }
                        } })) : ((0, jsx_runtime_1.jsx)("h2", { className: "m-0 flex-1 cursor-pointer truncate text-sm font-semibold hover:opacity-70 transition-opacity", onClick: () => {
                            setIsEditing(true);
                            setTimeout(() => titleInputRef.current?.select(), 0);
                        }, title: "Click to rename", children: chatTitle })), (0, jsx_runtime_1.jsx)("button", { className: "shrink-0 rounded p-1 opacity-50 hover:bg-vscode-list-hover hover:opacity-100 transition-all", onClick: () => {
                            setIsEditing(true);
                            setTimeout(() => titleInputRef.current?.select(), 0);
                        }, title: "Rename chat", children: (0, jsx_runtime_1.jsx)("span", { className: "codicon codicon-edit" }) })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex-1 space-y-3 overflow-y-auto py-3", children: [transcript.length === 0 && ((0, jsx_runtime_1.jsx)("p", { className: "mt-8 px-3 text-center text-sm opacity-50", children: "Ask a question about accessibility\u2026" })), transcript.map((item) => item.kind === "message" ? ((0, jsx_runtime_1.jsx)(MessageBubble, { msg: item }, item.id)) : ((0, jsx_runtime_1.jsx)(ActivityCard, { item: item, collapsed: collapsedCards[item.id] ?? false, onToggle: () => setCollapsedCards((prev) => ({
                            ...prev,
                            [item.id]: !(prev[item.id] ?? false),
                        })) }, item.id))), (0, jsx_runtime_1.jsx)("div", { ref: bottomRef })] }), (0, jsx_runtime_1.jsx)(TodoPanel, { tasks: tasks }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-end gap-2 border-t border-vscode-border p-2", children: [(0, jsx_runtime_1.jsx)("textarea", { className: "min-h-[36px] max-h-[120px] flex-1 resize-none rounded border border-vscode-input-border bg-vscode-input-bg px-2 py-1.5 text-sm text-vscode-input-fg outline-none focus:border-vscode-button-bg", rows: 1, placeholder: "Ask about WCAG compliance\u2026", value: input, onChange: (event) => setInput(event.target.value), onKeyDown: handleKeyDown }), (0, jsx_runtime_1.jsx)("button", { className: "rounded bg-vscode-button-bg px-3 py-1.5 text-sm font-medium text-vscode-button-fg hover:bg-vscode-button-hover transition-colors disabled:opacity-40", disabled: !input.trim(), onClick: handleSend, children: "Send" })] })] }));
}


/***/ },

/***/ "./src/webview/sidebar/SidebarApp.tsx"
/*!********************************************!*\
  !*** ./src/webview/sidebar/SidebarApp.tsx ***!
  \********************************************/
(__unused_webpack_module, exports, __webpack_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports["default"] = SidebarApp;
const jsx_runtime_1 = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'react/jsx-runtime'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
const react_1 = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'react'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
const vscodeApi_1 = __webpack_require__(/*! ../shared/vscodeApi */ "./src/webview/shared/vscodeApi.ts");
const ChatListView_1 = __importDefault(__webpack_require__(/*! ./ChatListView */ "./src/webview/sidebar/ChatListView.tsx"));
const ChatView_1 = __importDefault(__webpack_require__(/*! ./ChatView */ "./src/webview/sidebar/ChatView.tsx"));
function SidebarApp() {
    const vscodeApi = (0, vscodeApi_1.getVsCodeApi)();
    const [screen, setScreen] = (0, react_1.useState)({ view: "list" });
    // ── Listen for CHAT_OPENED / CHAT_RENAMED ────────────────────────
    (0, react_1.useEffect)(() => {
        return (0, vscodeApi_1.onExtensionMessage)((msg) => {
            if (msg.type === "CHAT_OPENED") {
                setScreen({
                    view: "chat",
                    chatId: msg.payload.chatId,
                    title: msg.payload.title,
                });
            }
            if (msg.type === "CHAT_RENAMED" && screen.view === "chat" && screen.chatId === msg.payload.chatId) {
                setScreen((prev) => prev.view === "chat" ? { ...prev, title: msg.payload.title } : prev);
            }
        });
    }, [screen]);
    // ── Navigation callbacks ──────────────────────────────────────
    const handleOpenChat = (0, react_1.useCallback)((chatId) => {
        vscodeApi.postMessage({ type: "OPEN_CHAT", payload: { chatId } });
    }, [vscodeApi]);
    const handleNewChat = (0, react_1.useCallback)(() => {
        vscodeApi.postMessage({ type: "CREATE_CHAT" });
    }, [vscodeApi]);
    const handleBack = (0, react_1.useCallback)(() => {
        setScreen({ view: "list" });
        // Refresh the list when navigating back
        vscodeApi.postMessage({ type: "GET_CHAT_LIST" });
    }, [vscodeApi]);
    const handleTitleChanged = (0, react_1.useCallback)((chatId, newTitle) => {
        setScreen((prev) => prev.view === "chat" && prev.chatId === chatId
            ? { ...prev, title: newTitle }
            : prev);
    }, []);
    // ── Render ────────────────────────────────────────────────────
    if (screen.view === "chat") {
        return ((0, jsx_runtime_1.jsx)(ChatView_1.default, { chatId: screen.chatId, chatTitle: screen.title, onBack: handleBack, onTitleChanged: handleTitleChanged }));
    }
    return ((0, jsx_runtime_1.jsx)(ChatListView_1.default, { onOpenChat: handleOpenChat, onNewChat: handleNewChat }));
}


/***/ },

/***/ "./src/webview/sidebar/index.tsx"
/*!***************************************!*\
  !*** ./src/webview/sidebar/index.tsx ***!
  \***************************************/
(__unused_webpack_module, exports, __webpack_require__) {


var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
const jsx_runtime_1 = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'react/jsx-runtime'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
const client_1 = __webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module 'react-dom/client'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
const SidebarApp_1 = __importDefault(__webpack_require__(/*! ./SidebarApp */ "./src/webview/sidebar/SidebarApp.tsx"));
__webpack_require__(Object(function webpackMissingModule() { var e = new Error("Cannot find module '../shared/globals.css'"); e.code = 'MODULE_NOT_FOUND'; throw e; }()));
const container = document.getElementById("root");
const root = (0, client_1.createRoot)(container);
root.render((0, jsx_runtime_1.jsx)(SidebarApp_1.default, {}));


/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		if (!(moduleId in __webpack_modules__)) {
/******/ 			delete __webpack_module_cache__[moduleId];
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__("./src/webview/sidebar/index.tsx");
/******/ 	
/******/ })()
;
//# sourceMappingURL=sidebar.js.map