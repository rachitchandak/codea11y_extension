import express from "express";
import cors from "cors";
import * as fs from "fs";
import * as path from "path";
import {
  initDatabase,
  ignoreIssue as dbIgnoreIssue,
  getProjectAuditSnapshot,
  createSession,
  endSession,
  getActiveLlmProvider,
  insertLlmProvider,
  getAllLlmProviders,
} from "./db";
import { LLMClient } from "./LLMClient";
import { ToolWrapper } from "./ToolWrapper";
import { MainAgent } from "./MainAgent";
import type { AgentEvent } from "./MainAgent";
import { ReportService, ReportServiceNeedsUrlError } from "./ReportService";
import { mountAdminPanel } from "./adminPanel";
import {
  createProvider,
  type ProviderType,
  type LLMProvider,
} from "./providers";

/* ------------------------------------------------------------------ *
 *  Paths                                                              *
 * ------------------------------------------------------------------ */
const rootDir =
  process.env.CODEA11Y_ROOT || path.join(__dirname, "..", "..");

/* ------------------------------------------------------------------ *
 *  Express application                                                *
 * ------------------------------------------------------------------ */
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

const PORT = Number(process.env.CODEA11Y_PORT) || 7544;

/* ------------------------------------------------------------------ *
 *  Initialize database                                                *
 * ------------------------------------------------------------------ */
const dbDir = process.env.CODEA11Y_DB_DIR || rootDir;
initDatabase(dbDir);

/* ------------------------------------------------------------------ *
 *  Seed default provider from API.txt (one-time, if no providers yet) *
 * ------------------------------------------------------------------ */
function seedDefaultProvider(): void {
  const existing = getAllLlmProviders();
  if (existing.length > 0) return;

  const apiTxtPath = path.join(rootDir, "API.txt");
  if (!fs.existsSync(apiTxtPath)) return;

  try {
    const apiTxt = fs.readFileSync(apiTxtPath, "utf-8");
    const extract = (key: string): string => {
      const m = apiTxt.match(new RegExp(`${key}\\s*=\\s*"([^"]+)"`));
      return m ? m[1] : "";
    };

    const apiKey = extract("API_KEY");
    const resource = extract("RESOURCE");
    const deployment = extract("DEPLOYMENT");
    const apiVersion = extract("API_VERSION");

    if (apiKey && resource && deployment && apiVersion) {
      insertLlmProvider({
        name: "Azure OpenAI (from API.txt)",
        providerType: "azure-openai",
        configJson: JSON.stringify({ apiKey, resource, deployment, apiVersion }),
        isActive: true,
      });
      console.log("[init] Seeded default Azure OpenAI provider from API.txt");
    }
  } catch (err) {
    console.warn("[init] Could not seed provider from API.txt:", err);
  }
}
seedDefaultProvider();

/* ------------------------------------------------------------------ *
 *  Seed Groq provider (llama-3.3-70b-versatile)                      *
 * ------------------------------------------------------------------ */
(function seedGroqProvider(): void {
  const all = getAllLlmProviders();
  const alreadyExists = all.some(
    (p) => p.providerType === "groq" && p.name === "Groq Llama 3.3 70B"
  );
  if (alreadyExists) return;

  // Deactivate any existing providers so this one becomes active
  insertLlmProvider({
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
function buildActiveProvider(): LLMProvider {
  const row = getActiveLlmProvider();
  if (!row) {
    throw new Error(
      "No active LLM provider configured. Go to /admin/providers to set one up."
    );
  }
  const config = JSON.parse(row.configJson) as Record<string, string>;
  return createProvider(row.providerType as ProviderType, config);
}

let activeProvider: LLMProvider;
try {
  activeProvider = buildActiveProvider();
} catch (err: any) {
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
const llmClient = new LLMClient(activeProvider);
const toolWrapper = new ToolWrapper(path.join(rootDir, "wcag-mapper"));
const reportService = new ReportService(llmClient, toolWrapper);

/** Called by admin panel when the active provider changes at runtime. */
export function reloadActiveProvider(): void {
  try {
    const provider = buildActiveProvider();
    llmClient.setProvider(provider);
    console.log(`[providers] Switched to: ${provider.displayModel}`);
  } catch (err: any) {
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

    const sessionId = createSession(`Report: ${filePath}`, rootPath);
    llmClient.setSession(sessionId);
    llmClient.setPhase("report");

    try {
      const report = await reportService.retrieveOrInitiateAudit({
        filePath,
        rootPath,
        projectUrl,
      });

      endSession(sessionId, "completed");
      res.json({ report });
    } catch (err) {
      endSession(sessionId, "error");
      throw err;
    } finally {
      llmClient.setSession(null);
      llmClient.setPhase(null);
    }
  } catch (err) {
    if (err instanceof ReportServiceNeedsUrlError) {
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
  } catch (err) {
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

    const files = getProjectAuditSnapshot(rootPath);
    res.json({
      projectPath: rootPath,
      projectName: path.basename(rootPath),
      createdAt: new Date().toISOString(),
      files,
    });
  } catch (err) {
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
  const sessionId = createSession(userQuery, rootPath);
  llmClient.setSession(sessionId);

  // Stream NDJSON events back to the client
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Content-Type-Options": "nosniff",
  });

  const agent = new MainAgent(llmClient, toolWrapper);

  agent.on("event", (evt: AgentEvent) => {
    if (!res.writableEnded) {
      res.write(JSON.stringify(evt) + "\n");
    }
  });

  try {
    await agent.run({ userQuery, fileTree, rootPath, projectUrl, forceRuntime });
    endSession(sessionId, "completed");
  } catch (err) {
    endSession(sessionId, "error");
    throw err;
  } finally {
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

    dbIgnoreIssue(Number(issueId));
    res.json({ success: true });
  } catch (err: any) {
    console.error("[ignore-issue] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ *
 *  Admin panel                                                        *
 * ------------------------------------------------------------------ */
mountAdminPanel(app, reloadActiveProvider);

/* ------------------------------------------------------------------ *
 *  Start server                                                       *
 * ------------------------------------------------------------------ */
app.listen(PORT, () => {
  console.log(`Codea11y proxy server running on http://localhost:${PORT}`);
});
