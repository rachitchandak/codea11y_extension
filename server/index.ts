import express from "express";
import cors from "cors";
import * as fs from "fs";
import * as path from "path";
import { AzureOpenAI } from "openai";
import {
  initDatabase,
  ignoreIssue as dbIgnoreIssue,
} from "./db";
import { LLMClient } from "./LLMClient";
import { ToolWrapper } from "./ToolWrapper";
import { MainAgent } from "./MainAgent";
import type { AgentEvent } from "./MainAgent";

/* ------------------------------------------------------------------ *
 *  Parse Azure OpenAI credentials from API.txt                       *
 * ------------------------------------------------------------------ */
const rootDir =
  process.env.CODEA11Y_ROOT || path.join(__dirname, "..", "..");
const apiTxtPath = path.join(rootDir, "API.txt");
const apiTxt = fs.readFileSync(apiTxtPath, "utf-8");

function extractValue(text: string, key: string): string {
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
const openai = new AzureOpenAI({
  apiKey: API_KEY,
  endpoint: `https://${RESOURCE}.openai.azure.com`,
  apiVersion: API_VERSION,
  deployment: DEPLOYMENT,
});

/* ------------------------------------------------------------------ *
 *  Express application                                                *
 * ------------------------------------------------------------------ */
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = Number(process.env.CODEA11Y_PORT) || 7544;

/* ------------------------------------------------------------------ *
 *  Initialize database                                                *
 * ------------------------------------------------------------------ */
const dbDir = process.env.CODEA11Y_DB_DIR || rootDir;
initDatabase(dbDir);

/* ------------------------------------------------------------------ *
 *  Agent infrastructure                                               *
 * ------------------------------------------------------------------ */
const llmClient = new LLMClient(openai, DEPLOYMENT);
const toolWrapper = new ToolWrapper(path.join(rootDir, "wcag-mapper"));

/* ------------------------------------------------------------------ *
 *  GET /health                                                        *
 * ------------------------------------------------------------------ */
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
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

  const agent = new MainAgent(llmClient, toolWrapper);

  agent.on("event", (evt: AgentEvent) => {
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

    dbIgnoreIssue(Number(issueId));
    res.json({ success: true });
  } catch (err: any) {
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
