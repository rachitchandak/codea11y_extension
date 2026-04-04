import type { LLMProvider, ChatMessage } from "./providers";
import { insertLlmApiCall } from "./db";

export type { ChatMessage };

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "…";
}

/* ------------------------------------------------------------------ *
 *  LLMClient                                                          *
 *  Manages conversation "threads" as in-memory message arrays so      *
 *  that file context is preserved (cached) across sequential          *
 *  guideline checks on the same file.                                 *
 *                                                                     *
 *  The actual LLM call is delegated to an LLMProvider adapter.        *
 * ------------------------------------------------------------------ */
export class LLMClient {
  private threads = new Map<string, ChatMessage[]>();
  private _sessionId: number | null = null;
  private _phase: string | null = null;
  private _provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this._provider = provider;
  }

  /* ── Hot-swap the underlying provider ──────────────────────────── */
  setProvider(provider: LLMProvider): void {
    this._provider = provider;
  }

  get providerModel(): string {
    return this._provider.displayModel;
  }

  /* ── Session tracking for logging ──────────────────────────────── */
  setSession(sessionId: number | null): void {
    this._sessionId = sessionId;
  }

  setPhase(phase: string | null): void {
    this._phase = phase;
  }

  /* ── Create a new conversation thread with a system prompt ──────── */
  createThread(threadId: string, systemPrompt: string): void {
    this.threads.set(threadId, [{ role: "system", content: systemPrompt }]);
  }

  /* ── Send a user message on an existing thread, return reply ────── */
  async send(
    threadId: string,
    content: string,
    opts?: { json?: boolean }
  ): Promise<string> {
    const history = this.threads.get(threadId);
    if (!history) {
      throw new Error(`Thread "${threadId}" does not exist.`);
    }

    history.push({ role: "user", content });

    const startMs = Date.now();

    const result = await this._provider.chat(history, opts);

    const durationMs = Date.now() - startMs;
    const reply = result.content;
    history.push({ role: "assistant", content: reply });

    // Log the API call
    const systemMsg = history.find((m) => m.role === "system");

    try {
      insertLlmApiCall({
        sessionId: this._sessionId,
        threadId,
        phase: this._phase,
        model: this._provider.displayModel,
        systemPromptPreview: systemMsg ? truncate(systemMsg.content, 200) : null,
        userPromptPreview: truncate(content, 300),
        responsePreview: truncate(reply, 300),
        fullUserPrompt: content,
        fullResponse: reply,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        durationMs,
        isJsonMode: opts?.json === true,
      });
    } catch (logErr) {
      console.error("[LLMClient] Failed to log API call:", logErr);
    }

    return reply;
  }

  /* ── Tear down a thread to free memory ─────────────────────────── */
  dropThread(threadId: string): void {
    this.threads.delete(threadId);
  }

  hasThread(threadId: string): boolean {
    return this.threads.has(threadId);
  }
}
