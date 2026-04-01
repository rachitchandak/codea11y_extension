"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMClient = void 0;
/* ------------------------------------------------------------------ *
 *  LLMClient                                                          *
 *  Manages conversation "threads" as in-memory message arrays so      *
 *  that file context is preserved (cached) across sequential          *
 *  guideline checks on the same file.                                 *
 * ------------------------------------------------------------------ */
class LLMClient {
    constructor(client, deployment) {
        this.client = client;
        this.deployment = deployment;
        this.threads = new Map();
    }
    /* ── Create a new conversation thread with a system prompt ──────── */
    createThread(threadId, systemPrompt) {
        this.threads.set(threadId, [{ role: "system", content: systemPrompt }]);
    }
    /* ── Send a user message on an existing thread, return reply ────── */
    async send(threadId, content, opts) {
        const history = this.threads.get(threadId);
        if (!history) {
            throw new Error(`Thread "${threadId}" does not exist.`);
        }
        history.push({ role: "user", content });
        const completion = await this.client.chat.completions.create({
            model: this.deployment,
            messages: history,
            ...(opts?.json
                ? { response_format: { type: "json_object" } }
                : {}),
        });
        const reply = completion.choices[0]?.message?.content ?? "";
        history.push({ role: "assistant", content: reply });
        return reply;
    }
    /* ── Tear down a thread to free memory ─────────────────────────── */
    dropThread(threadId) {
        this.threads.delete(threadId);
    }
    hasThread(threadId) {
        return this.threads.has(threadId);
    }
}
exports.LLMClient = LLMClient;
//# sourceMappingURL=LLMClient.js.map