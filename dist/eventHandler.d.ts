import { SidebarProvider } from "./providers/SidebarProvider";
export declare function resetChatActivityState(sidebarProvider?: SidebarProvider): void;
export declare function resetSidebarTodoState(sidebarProvider?: SidebarProvider): void;
/**
 * Handle NDJSON events streamed from the MainAgent on the server.
 */
export declare function handleAgentEvent(evt: {
    event: string;
    data: Record<string, unknown>;
}, query: string, sidebarProvider: SidebarProvider, runAgentAudit: (query: string, projectUrl?: string) => void): void;
