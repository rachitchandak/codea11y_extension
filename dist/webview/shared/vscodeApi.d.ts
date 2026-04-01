import type { WebviewToExtensionMessage, ExtensionToWebviewMessage } from "../../shared/messages";
export declare function getVsCodeApi(): {
    postMessage(message: WebviewToExtensionMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
};
/**
 * Subscribe to messages coming FROM the extension host.
 * Returns an unsubscribe function.
 */
export declare function onExtensionMessage(handler: (msg: ExtensionToWebviewMessage) => void): () => void;
