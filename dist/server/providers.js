"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiProvider = exports.ClaudeProvider = exports.GroqProvider = exports.OpenAIProvider = exports.AzureOpenAIProvider = exports.PROVIDER_CATALOG = void 0;
exports.createProvider = createProvider;
const openai_1 = require("openai");
exports.PROVIDER_CATALOG = {
    "azure-openai": {
        label: "Azure OpenAI",
        fields: [
            { key: "apiKey", label: "API Key", type: "password", required: true },
            { key: "resource", label: "Resource Name", type: "text", required: true, placeholder: "my-resource" },
            { key: "deployment", label: "Deployment Name", type: "text", required: true, placeholder: "gpt-4o" },
            { key: "apiVersion", label: "API Version", type: "text", required: true, placeholder: "2024-08-01-preview" },
        ],
    },
    openai: {
        label: "OpenAI",
        fields: [
            { key: "apiKey", label: "API Key", type: "password", required: true },
            { key: "model", label: "Model", type: "text", required: true, placeholder: "gpt-4o" },
            { key: "baseUrl", label: "Base URL (optional)", type: "text", placeholder: "https://api.openai.com/v1" },
        ],
    },
    groq: {
        label: "Groq",
        fields: [
            { key: "apiKey", label: "API Key", type: "password", required: true },
            { key: "model", label: "Model", type: "text", required: true, placeholder: "llama-3.3-70b-versatile" },
        ],
    },
    claude: {
        label: "Anthropic Claude",
        fields: [
            { key: "apiKey", label: "API Key", type: "password", required: true },
            { key: "model", label: "Model", type: "text", required: true, placeholder: "claude-sonnet-4-20250514" },
            { key: "baseUrl", label: "Base URL (optional)", type: "text", placeholder: "https://api.anthropic.com" },
            { key: "maxTokens", label: "Max Tokens", type: "text", placeholder: "4096" },
        ],
    },
    gemini: {
        label: "Google Gemini",
        fields: [
            { key: "apiKey", label: "API Key", type: "password", required: true },
            { key: "model", label: "Model", type: "text", required: true, placeholder: "gemini-2.5-flash" },
        ],
    },
};
/* ================================================================== *
 *  Concrete adapters                                                  *
 * ================================================================== */
/* ── Azure OpenAI ─────────────────────────────────────────────────── */
class AzureOpenAIProvider {
    constructor(config) {
        const { apiKey, resource, deployment, apiVersion } = config;
        if (!apiKey || !resource || !deployment || !apiVersion) {
            throw new Error("Azure OpenAI requires apiKey, resource, deployment, apiVersion");
        }
        this.displayModel = deployment;
        this.client = new openai_1.AzureOpenAI({
            apiKey,
            endpoint: `https://${resource}.openai.azure.com`,
            apiVersion,
            deployment,
        });
    }
    async chat(messages, opts) {
        const completion = await this.client.chat.completions.create({
            model: this.displayModel,
            messages,
            ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
        });
        const usage = completion.usage;
        return {
            content: completion.choices[0]?.message?.content ?? "",
            usage: {
                promptTokens: usage?.prompt_tokens ?? null,
                completionTokens: usage?.completion_tokens ?? null,
                totalTokens: usage?.total_tokens ?? null,
            },
        };
    }
}
exports.AzureOpenAIProvider = AzureOpenAIProvider;
/* ── OpenAI (direct) ──────────────────────────────────────────────── */
class OpenAIProvider {
    constructor(config) {
        const { apiKey, model, baseUrl } = config;
        if (!apiKey || !model) {
            throw new Error("OpenAI requires apiKey and model");
        }
        this.displayModel = model;
        this.client = new openai_1.OpenAI({
            apiKey,
            ...(baseUrl ? { baseURL: baseUrl } : {}),
        });
    }
    async chat(messages, opts) {
        const completion = await this.client.chat.completions.create({
            model: this.displayModel,
            messages,
            ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
        });
        const usage = completion.usage;
        return {
            content: completion.choices[0]?.message?.content ?? "",
            usage: {
                promptTokens: usage?.prompt_tokens ?? null,
                completionTokens: usage?.completion_tokens ?? null,
                totalTokens: usage?.total_tokens ?? null,
            },
        };
    }
}
exports.OpenAIProvider = OpenAIProvider;
/* ── Groq (OpenAI-compatible) ─────────────────────────────────────── */
class GroqProvider {
    constructor(config) {
        const { apiKey, model } = config;
        if (!apiKey || !model) {
            throw new Error("Groq requires apiKey and model");
        }
        this.displayModel = model;
        this.client = new openai_1.OpenAI({
            apiKey,
            baseURL: "https://api.groq.com/openai/v1",
        });
    }
    async chat(messages, opts) {
        const completion = await this.client.chat.completions.create({
            model: this.displayModel,
            messages,
            ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
        });
        const usage = completion.usage;
        return {
            content: completion.choices[0]?.message?.content ?? "",
            usage: {
                promptTokens: usage?.prompt_tokens ?? null,
                completionTokens: usage?.completion_tokens ?? null,
                totalTokens: usage?.total_tokens ?? null,
            },
        };
    }
}
exports.GroqProvider = GroqProvider;
class ClaudeProvider {
    constructor(config) {
        const { apiKey, model, baseUrl, maxTokens } = config;
        if (!apiKey || !model) {
            throw new Error("Claude requires apiKey and model");
        }
        this.apiKey = apiKey;
        this.displayModel = model;
        this.baseUrl = (baseUrl || "https://api.anthropic.com").replace(/\/+$/, "");
        this.maxTokens = Number(maxTokens) || 4096;
    }
    async chat(messages, opts) {
        // Claude uses a separate `system` parameter rather than a system message
        const systemMsg = messages.find((m) => m.role === "system");
        const nonSystemMsgs = messages.filter((m) => m.role !== "system");
        // Claude needs alternating user/assistant. Merge consecutive same-role.
        const claudeMsgs = this.mergeConsecutive(nonSystemMsgs);
        const body = {
            model: this.displayModel,
            max_tokens: this.maxTokens,
            messages: claudeMsgs.map((m) => ({ role: m.role, content: m.content })),
        };
        if (systemMsg) {
            body.system = systemMsg.content;
        }
        // For JSON mode, Claude doesn't have a native toggle — we prefill the
        // assistant turn with `{` so the model continues in JSON.
        if (opts?.json) {
            body.messages = [
                ...body.messages,
                { role: "assistant", content: "{" },
            ];
        }
        const res = await fetch(`${this.baseUrl}/v1/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": this.apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Claude API error ${res.status}: ${text}`);
        }
        const data = (await res.json());
        let content = data.content
            .filter((c) => c.type === "text" && c.text)
            .map((c) => c.text)
            .join("");
        // If we prefilled `{`, prepend it back to the response
        if (opts?.json) {
            content = "{" + content;
        }
        const inputTokens = data.usage?.input_tokens ?? null;
        const outputTokens = data.usage?.output_tokens ?? null;
        return {
            content,
            usage: {
                promptTokens: inputTokens,
                completionTokens: outputTokens,
                totalTokens: inputTokens != null && outputTokens != null
                    ? inputTokens + outputTokens
                    : null,
            },
        };
    }
    mergeConsecutive(msgs) {
        const merged = [];
        for (const msg of msgs) {
            const role = msg.role === "assistant" ? "assistant" : "user";
            const last = merged[merged.length - 1];
            if (last && last.role === role) {
                last.content += "\n\n" + msg.content;
            }
            else {
                merged.push({ role, content: msg.content });
            }
        }
        // Claude requires the first message to be "user"
        if (merged.length > 0 && merged[0].role !== "user") {
            merged.unshift({ role: "user", content: "(system context above)" });
        }
        return merged;
    }
}
exports.ClaudeProvider = ClaudeProvider;
class GeminiProvider {
    constructor(config) {
        const { apiKey, model } = config;
        if (!apiKey || !model) {
            throw new Error("Gemini requires apiKey and model");
        }
        this.apiKey = apiKey;
        this.displayModel = model;
    }
    async chat(messages, opts) {
        // Gemini uses `systemInstruction` for system messages and `contents` for the rest
        const systemMsg = messages.find((m) => m.role === "system");
        const nonSystem = messages.filter((m) => m.role !== "system");
        const contents = nonSystem.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
        }));
        const body = { contents };
        if (systemMsg) {
            body.systemInstruction = { parts: [{ text: systemMsg.content }] };
        }
        if (opts?.json) {
            body.generationConfig = {
                responseMimeType: "application/json",
            };
        }
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.displayModel)}:generateContent?key=${this.apiKey}`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Gemini API error ${res.status}: ${text}`);
        }
        const data = (await res.json());
        const content = data.candidates?.[0]?.content?.parts
            ?.map((p) => p.text || "")
            .join("") ?? "";
        const meta = data.usageMetadata;
        return {
            content,
            usage: {
                promptTokens: meta?.promptTokenCount ?? null,
                completionTokens: meta?.candidatesTokenCount ?? null,
                totalTokens: meta?.totalTokenCount ?? null,
            },
        };
    }
}
exports.GeminiProvider = GeminiProvider;
/* ================================================================== *
 *  Factory                                                            *
 * ================================================================== */
const ADAPTER_MAP = {
    "azure-openai": AzureOpenAIProvider,
    openai: OpenAIProvider,
    groq: GroqProvider,
    claude: ClaudeProvider,
    gemini: GeminiProvider,
};
function createProvider(providerType, config) {
    const Ctor = ADAPTER_MAP[providerType];
    if (!Ctor) {
        throw new Error(`Unknown provider type: ${providerType}`);
    }
    return new Ctor(config);
}
//# sourceMappingURL=providers.js.map