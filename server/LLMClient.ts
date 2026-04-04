import type { AzureOpenAI } from "openai";

/* ------------------------------------------------------------------ *
 *  Thread message shape (compatible with OpenAI chat completions)     *
 * ------------------------------------------------------------------ */
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/* ------------------------------------------------------------------ *
 *  LLMClient                                                          *
 *  Manages conversation "threads" as in-memory message arrays so      *
 *  that file context is preserved (cached) across sequential          *
 *  guideline checks on the same file.                                 *
 * ------------------------------------------------------------------ */
export class LLMClient {
  private threads = new Map<string, ChatMessage[]>();

  constructor(
    private client: AzureOpenAI,
    private deployment: string
  ) {}

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

    const completion = await this.client.chat.completions.create({
      model: this.deployment,
      messages: history,
      ...(opts?.json
        ? { response_format: { type: "json_object" as const } }
        : {}),
    });

    const reply = completion.choices[0]?.message?.content ?? "";
    history.push({ role: "assistant", content: reply });
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
