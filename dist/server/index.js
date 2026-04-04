"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reloadActiveProvider = reloadActiveProvider;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const db_1 = require("./db");
const LLMClient_1 = require("./LLMClient");
const ToolWrapper_1 = require("./ToolWrapper");
const MainAgent_1 = require("./MainAgent");
const ReportService_1 = require("./ReportService");
const adminPanel_1 = require("./adminPanel");
const providers_1 = require("./providers");
/* ------------------------------------------------------------------ *
 *  Paths                                                              *
 * ------------------------------------------------------------------ */
const rootDir = process.env.CODEA11Y_ROOT || path.join(__dirname, "..", "..");
/* ------------------------------------------------------------------ *
 *  Express application                                                *
 * ------------------------------------------------------------------ */
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
const PORT = Number(process.env.CODEA11Y_PORT) || 7544;
/* ------------------------------------------------------------------ *
 *  Initialize database                                                *
 * ------------------------------------------------------------------ */
const dbDir = process.env.CODEA11Y_DB_DIR || rootDir;
(0, db_1.initDatabase)(dbDir);
/* ------------------------------------------------------------------ *
 *  Seed default provider from API.txt (one-time, if no providers yet) *
 * ------------------------------------------------------------------ */
function seedDefaultProvider() {
    const existing = (0, db_1.getAllLlmProviders)();
    if (existing.length > 0)
        return;
    const apiTxtPath = path.join(rootDir, "API.txt");
    if (!fs.existsSync(apiTxtPath))
        return;
    try {
        const apiTxt = fs.readFileSync(apiTxtPath, "utf-8");
        const extract = (key) => {
            const m = apiTxt.match(new RegExp(`${key}\\s*=\\s*"([^"]+)"`));
            return m ? m[1] : "";
        };
        const apiKey = extract("API_KEY");
        const resource = extract("RESOURCE");
        const deployment = extract("DEPLOYMENT");
        const apiVersion = extract("API_VERSION");
        if (apiKey && resource && deployment && apiVersion) {
            (0, db_1.insertLlmProvider)({
                name: "Azure OpenAI (from API.txt)",
                providerType: "azure-openai",
                configJson: JSON.stringify({ apiKey, resource, deployment, apiVersion }),
                isActive: true,
            });
            console.log("[init] Seeded default Azure OpenAI provider from API.txt");
        }
    }
    catch (err) {
        console.warn("[init] Could not seed provider from API.txt:", err);
    }
}
seedDefaultProvider();
/* ------------------------------------------------------------------ *
 *  Seed Groq provider (llama-3.3-70b-versatile)                      *
 * ------------------------------------------------------------------ */
(function seedGroqProvider() {
    const all = (0, db_1.getAllLlmProviders)();
    const alreadyExists = all.some((p) => p.providerType === "groq" && p.name === "Groq Llama 3.3 70B");
    if (alreadyExists)
        return;
    // Deactivate any existing providers so this one becomes active
    (0, db_1.insertLlmProvider)({
        name: "Groq Llama 3.3 70B",
        providerType: "groq",
        configJson: JSON.stringify({
            apiKey: "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",
            model: "llama-3.3-70b-versatile",
        }),
        isActive: true,
    });
    console.log("[init] Seeded Groq provider (llama-3.3-70b-versatile)");
})();
/* ------------------------------------------------------------------ *
 *  Build provider from DB or fail with a clear message                *
 * ------------------------------------------------------------------ */
function buildActiveProvider() {
    const row = (0, db_1.getActiveLlmProvider)();
    if (!row) {
        throw new Error("No active LLM provider configured. Go to /admin/providers to set one up.");
    }
    const config = JSON.parse(row.configJson);
    return (0, providers_1.createProvider)(row.providerType, config);
}
let activeProvider;
try {
    activeProvider = buildActiveProvider();
}
catch (err) {
    console.warn("[init]", err.message, "— server will start but LLM calls will fail until a provider is configured.");
    // Create a stub that throws so the server can still start and serve the admin panel
    activeProvider = {
        displayModel: "(none)",
        async chat() {
            throw new Error("No active LLM provider configured. Go to /admin/providers to set one up.");
        },
    };
}
/* ------------------------------------------------------------------ *
 *  Agent infrastructure                                               *
 * ------------------------------------------------------------------ */
const llmClient = new LLMClient_1.LLMClient(activeProvider);
const toolWrapper = new ToolWrapper_1.ToolWrapper(path.join(rootDir, "wcag-mapper"));
const reportService = new ReportService_1.ReportService(llmClient, toolWrapper);
/** Called by admin panel when the active provider changes at runtime. */
function reloadActiveProvider() {
    try {
        const provider = buildActiveProvider();
        llmClient.setProvider(provider);
        console.log(`[providers] Switched to: ${provider.displayModel}`);
    }
    catch (err) {
        console.error("[providers] Failed to reload provider:", err.message);
    }
}
/* ------------------------------------------------------------------ *
 *  GET /health                                                        *
 * ------------------------------------------------------------------ */
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
/* ------------------------------------------------------------------ *
 *  POST /reports/open                                                 *
 *  Accepts: { filePath, rootPath, projectUrl? }                       *
 * ------------------------------------------------------------------ */
app.post("/reports/open", async (req, res) => {
    try {
        const { filePath, rootPath, projectUrl } = req.body;
        if (!filePath || !rootPath) {
            res.status(400).json({ error: "Missing required fields: filePath, rootPath" });
            return;
        }
        const sessionId = (0, db_1.createSession)(`Report: ${filePath}`, rootPath);
        llmClient.setSession(sessionId);
        llmClient.setPhase("report");
        try {
            const report = await reportService.retrieveOrInitiateAudit({
                filePath,
                rootPath,
                projectUrl,
            });
            (0, db_1.endSession)(sessionId, "completed");
            res.json({ report });
        }
        catch (err) {
            (0, db_1.endSession)(sessionId, "error");
            throw err;
        }
        finally {
            llmClient.setSession(null);
            llmClient.setPhase(null);
        }
    }
    catch (err) {
        if (err instanceof ReportService_1.ReportServiceNeedsUrlError) {
            res.status(409).json({ error: err.message, needsUrl: true });
            return;
        }
        const message = err instanceof Error ? err.message : String(err);
        console.error("[reports/open] Error:", message);
        res.status(500).json({ error: message });
    }
});
/* ------------------------------------------------------------------ *
 *  GET /reports/:id                                                   *
 * ------------------------------------------------------------------ */
app.get("/reports/:id", async (req, res) => {
    try {
        const reportId = Number(req.params.id);
        if (!Number.isFinite(reportId)) {
            res.status(400).json({ error: "Invalid report id" });
            return;
        }
        const report = await reportService.getReportById(reportId);
        if (!report) {
            res.status(404).json({ error: "Report not found" });
            return;
        }
        res.json({ report });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[reports/:id] Error:", message);
        res.status(500).json({ error: message });
    }
});
/* ------------------------------------------------------------------ *
 *  POST /reports/project-snapshot                                     *
 *  Accepts: { rootPath }                                              *
 * ------------------------------------------------------------------ */
app.post("/reports/project-snapshot", (req, res) => {
    try {
        const { rootPath } = req.body;
        if (!rootPath) {
            res.status(400).json({ error: "Missing required field: rootPath" });
            return;
        }
        const files = (0, db_1.getProjectAuditSnapshot)(rootPath);
        res.json({
            projectPath: rootPath,
            projectName: path.basename(rootPath),
            createdAt: new Date().toISOString(),
            files,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[reports/project-snapshot] Error:", message);
        res.status(500).json({ error: message });
    }
});
/* ------------------------------------------------------------------ *
 *  POST /agent/start                                                  *
 *  Kicks off the full MainAgent workflow and streams events as NDJSON. *
 *  Accepts: { userQuery, fileTree, rootPath, projectUrl?, forceRuntime? }
 * ------------------------------------------------------------------ */
app.post("/agent/start", async (req, res) => {
    const { userQuery, fileTree, rootPath, projectUrl, forceRuntime } = req.body;
    if (!userQuery || !fileTree || !rootPath) {
        res
            .status(400)
            .json({ error: "Missing required fields: userQuery, fileTree, rootPath" });
        return;
    }
    // Create a session for this audit run
    const sessionId = (0, db_1.createSession)(userQuery, rootPath);
    llmClient.setSession(sessionId);
    // Stream NDJSON events back to the client
    res.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Content-Type-Options": "nosniff",
    });
    const agent = new MainAgent_1.MainAgent(llmClient, toolWrapper);
    agent.on("event", (evt) => {
        if (!res.writableEnded) {
            res.write(JSON.stringify(evt) + "\n");
        }
    });
    try {
        await agent.run({ userQuery, fileTree, rootPath, projectUrl, forceRuntime });
        (0, db_1.endSession)(sessionId, "completed");
    }
    catch (err) {
        (0, db_1.endSession)(sessionId, "error");
        throw err;
    }
    finally {
        llmClient.setSession(null);
        llmClient.setPhase(null);
    }
    res.end();
});
/* ------------------------------------------------------------------ *
 *  POST /ignore-issue                                                 *
 *  Accepts: { issueId }                                               *
 * ------------------------------------------------------------------ */
app.post("/ignore-issue", (req, res) => {
    try {
        const { issueId } = req.body;
        if (!issueId) {
            res.status(400).json({ error: "Missing issueId" });
            return;
        }
        (0, db_1.ignoreIssue)(Number(issueId));
        res.json({ success: true });
    }
    catch (err) {
        console.error("[ignore-issue] Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});
/* ------------------------------------------------------------------ *
 *  Admin panel                                                        *
 * ------------------------------------------------------------------ */
(0, adminPanel_1.mountAdminPanel)(app, reloadActiveProvider);
/* ------------------------------------------------------------------ *
 *  Start server                                                       *
 * ------------------------------------------------------------------ */
app.listen(PORT, () => {
    console.log(`Codea11y proxy server running on http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map