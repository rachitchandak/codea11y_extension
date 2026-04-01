import type {
  WebviewToExtensionMessage,
  ExtensionToWebviewMessage,
} from "../../shared/messages";

/**
 * Type-safe wrapper around the VS Code webview postMessage API.
 * Works in both sidebar and report webviews.
 */

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToExtensionMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

// Singleton
let _api: ReturnType<typeof acquireVsCodeApi> | undefined;

export function getVsCodeApi() {
  if (!_api) {
    _api = acquireVsCodeApi();
  }
  return _api;
}

/**
 * Subscribe to messages coming FROM the extension host.
 * Returns an unsubscribe function.
 */
export function onExtensionMessage(
  handler: (msg: ExtensionToWebviewMessage) => void
): () => void {
  const listener = (event: MessageEvent<ExtensionToWebviewMessage>) => {
    handler(event.data);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
