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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const openai_1 = require("openai");
const db_1 = require("./db");
const LLMClient_1 = require("./LLMClient");
const ToolWrapper_1 = require("./ToolWrapper");
const MainAgent_1 = require("./MainAgent");
const ReportService_1 = require("./ReportService");
/* ------------------------------------------------------------------ *
 *  Parse Azure OpenAI credentials from API.txt                       *
 * ------------------------------------------------------------------ */
const rootDir = process.env.CODEA11Y_ROOT || path.join(__dirname, "..", "..");
const apiTxtPath = path.join(rootDir, "API.txt");
const apiTxt = fs.readFileSync(apiTxtPath, "utf-8");
function extractValue(text, key) {
    const match = text.match(new RegExp(`${key}\\s*=\\s*"([^"]+)"`));
    if (!match) {
        throw new Error(`Could not find ${key} in API.txt`);
    }
    return match[1];
}
const API_KEY = extractValue(apiTxt, "API_KEY");
const RESOURCE = extractValue(apiTxt, "RESOURCE");
const DEPLOYMENT = extractValue(apiTxt, "DEPLOYMENT");
const API_VERSION = extractValue(apiTxt, "API_VERSION");
/* ------------------------------------------------------------------ *
 *  Azure OpenAI client                                                *
 * ------------------------------------------------------------------ */
const openai = new openai_1.AzureOpenAI({
    apiKey: API_KEY,
    endpoint: `https://${RESOURCE}.openai.azure.com`,
    apiVersion: API_VERSION,
    deployment: DEPLOYMENT,
});
/* ------------------------------------------------------------------ *
 *  Express application                                                *
 * ------------------------------------------------------------------ */
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "10mb" }));
const PORT = Number(process.env.CODEA11Y_PORT) || 7544;
/* ------------------------------------------------------------------ *
 *  Initialize database                                                *
 * ------------------------------------------------------------------ */
const dbDir = process.env.CODEA11Y_DB_DIR || rootDir;
(0, db_1.initDatabase)(dbDir);
/* ------------------------------------------------------------------ *
 *  Agent infrastructure                                               *
 * ------------------------------------------------------------------ */
const llmClient = new LLMClient_1.LLMClient(openai, DEPLOYMENT);
const toolWrapper = new ToolWrapper_1.ToolWrapper(path.join(rootDir, "wcag-mapper"));
const reportService = new ReportService_1.ReportService(llmClient, toolWrapper);
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
        const report = await reportService.retrieveOrInitiateAudit({
            filePath,
            rootPath,
            projectUrl,
        });
        res.json({ report });
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
    await agent.run({ userQuery, fileTree, rootPath, projectUrl, forceRuntime });
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
 *  Start server                                                       *
 * ------------------------------------------------------------------ */
app.listen(PORT, () => {
    console.log(`Codea11y proxy server running on http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map