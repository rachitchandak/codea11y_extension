import Database from "better-sqlite3";
import * as path from "path";

let db: Database.Database;

export interface StoredReportPayload {
  reportId: string;
  filePath: string;
  fileHash: string;
  createdAt: string;
  source: "opened" | "generated";
  overallAccessibilityScore: number;
  dependencies: string[];
  results: Array<{
    id: string;
    filePath: string;
    guideline: string;
    severity: string;
    source?: "llm" | "runtime";
    snippet: string;
    ignored: boolean;
    lineNumber?: number;
    selector?: string;
    suggestion?: string;
    issueDescription?: string;
    confidence?: "high" | "medium" | "low";
  }>;
  groupedIssues: Array<{
    key: string;
    filePath: string;
    lineNumber?: number;
    selector?: string;
    label: string;
    issues: Array<{
      id: string;
      filePath: string;
      guideline: string;
      severity: string;
      source?: "llm" | "runtime";
      snippet: string;
      ignored: boolean;
      lineNumber?: number;
      selector?: string;
      suggestion?: string;
      issueDescription?: string;
      confidence?: "high" | "medium" | "low";
    }>;
  }>;
  fileEntries: Array<{
    filePath: string;
    issueCount: number;
  }>;
  counts: Record<"error" | "warning" | "info", number>;
}

interface ReportRow {
  id: number;
  project_id: number | null;
  file_path: string;
  file_hash: string;
  overall_accessibility_score: number;
  created_at: string;
  payload_json: string;
}

interface ProjectAuditSnapshotRow {
  file_id: number;
  file_path: string;
  file_hash: string | null;
  scan_status: string;
  runtime_analyzed: number;
  accessibility_score: number | null;
  issue_id: number | null;
  issue_description: string | null;
  guideline: string | null;
  severity: string | null;
  line_number: number | null;
  selector: string | null;
  snippet: string | null;
  suggestion: string | null;
  ignored: number | null;
  source: "llm" | "runtime" | null;
}

export interface ProjectAuditSnapshotIssue {
  id: string;
  filePath: string;
  guideline: string;
  severity: string;
  source?: "llm" | "runtime";
  snippet: string;
  ignored: boolean;
  lineNumber?: number;
  selector?: string;
  suggestion?: string;
  issueDescription?: string;
}

export interface ProjectAuditSnapshotFile {
  filePath: string;
  fileHash: string | null;
  scanStatus: string;
  runtimeAnalyzed: boolean;
  accessibilityScore: number | null;
  results: ProjectAuditSnapshotIssue[];
}

const SEVERITY_RANK: Record<string, number> = {
  info: 1,
  warning: 2,
  error: 3,
};

/* ------------------------------------------------------------------ *
 *  Initialize SQLite database and create schema                      *
 * ------------------------------------------------------------------ */
export function initDatabase(dbDir: string): Database.Database {
  const dbPath = path.join(dbDir, "codea11y.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      root_path TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS files (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      path                TEXT NOT NULL,
      file_hash           TEXT,
      scan_status         TEXT NOT NULL DEFAULT 'pending',
      runtime_analyzed    INTEGER NOT NULL DEFAULT 0,
      accessibility_score REAL,
      UNIQUE(project_id, path)
    );

    CREATE TABLE IF NOT EXISTS guidelines (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id     INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      wcag_id     TEXT NOT NULL,
      description TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'active',
      UNIQUE(file_id, wcag_id)
    );

    CREATE TABLE IF NOT EXISTS applicable_guidelines (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id     INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      wcag_id     TEXT NOT NULL,
      description TEXT NOT NULL,
      UNIQUE(file_id, wcag_id)
    );

    CREATE TABLE IF NOT EXISTS ignored_guidelines (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id     INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      wcag_id     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(file_id, wcag_id)
    );

    CREATE TABLE IF NOT EXISTS schema_meta (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_results (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id           INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      issue_description TEXT NOT NULL,
      guideline         TEXT,
      severity          TEXT DEFAULT 'warning',
      line_number       INTEGER,
      selector          TEXT,
      snippet           TEXT,
      suggestion        TEXT,
      ignored           INTEGER DEFAULT 0,
      source            TEXT NOT NULL DEFAULT 'llm'
    );

    CREATE TABLE IF NOT EXISTS reports (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id                  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      file_path                   TEXT NOT NULL,
      file_hash                   TEXT NOT NULL,
      overall_accessibility_score REAL NOT NULL,
      created_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      payload_json                TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reports_file_path_created_at
      ON reports(file_path, created_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      query      TEXT NOT NULL,
      root_path  TEXT,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at   TEXT,
      status     TEXT NOT NULL DEFAULT 'running'
    );

    CREATE TABLE IF NOT EXISTS llm_api_calls (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id            INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
      thread_id             TEXT,
      phase                 TEXT,
      model                 TEXT NOT NULL,
      system_prompt_preview TEXT,
      user_prompt_preview   TEXT,
      response_preview      TEXT,
      full_user_prompt      TEXT,
      full_response         TEXT,
      prompt_tokens         INTEGER,
      completion_tokens     INTEGER,
      total_tokens          INTEGER,
      duration_ms           INTEGER,
      is_json_mode          INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_llm_api_calls_session_id
      ON llm_api_calls(session_id);

    CREATE TABLE IF NOT EXISTS llm_providers (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      config_json   TEXT NOT NULL,
      is_active     INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: add `source` column for databases created before this change
  const cols = db
    .prepare("PRAGMA table_info(files)")
    .all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "runtime_analyzed")) {
    db.exec(
      "ALTER TABLE files ADD COLUMN runtime_analyzed INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!cols.some((c) => c.name === "file_hash")) {
    db.exec("ALTER TABLE files ADD COLUMN file_hash TEXT");
  }

  const auditResultCols = db
    .prepare("PRAGMA table_info(audit_results)")
    .all() as Array<{ name: string }>;
  if (!auditResultCols.some((c) => c.name === "source")) {
    db.exec(
      "ALTER TABLE audit_results ADD COLUMN source TEXT NOT NULL DEFAULT 'llm'"
    );
  }

  // One-time migration for splitting runtime applicability from user ignores.
  const splitMigration = db
    .prepare("SELECT value FROM schema_meta WHERE key = 'guideline_split_v1'")
    .get() as { value: string } | undefined;

  if (!splitMigration) {
    db.exec(`
      INSERT OR IGNORE INTO ignored_guidelines (file_id, wcag_id)
      SELECT file_id, wcag_id
      FROM guidelines
      WHERE status = 'ignored';

      DELETE FROM applicable_guidelines;
      UPDATE files SET runtime_analyzed = 0;

      INSERT INTO schema_meta (key, value)
      VALUES ('guideline_split_v1', 'done');
    `);
  }

  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

/* ------------------------------------------------------------------ *
 *  Project helpers                                                    *
 * ------------------------------------------------------------------ */
export function upsertProject(name: string, rootPath: string): number {
  const row = getDb()
    .prepare(
      `INSERT INTO projects (name, root_path) VALUES (?, ?)
       ON CONFLICT(root_path) DO UPDATE SET name = excluded.name
       RETURNING id`
    )
    .get(name, rootPath) as { id: number };
  return row.id;
}

/* ------------------------------------------------------------------ *
 *  File helpers                                                       *
 * ------------------------------------------------------------------ */
export function upsertFile(projectId: number, filePath: string): number {
  const row = getDb()
    .prepare(
      `INSERT INTO files (project_id, path) VALUES (?, ?)
       ON CONFLICT(project_id, path) DO UPDATE SET scan_status = 'pending'
       RETURNING id`
    )
    .get(projectId, filePath) as { id: number };
  return row.id;
}

export function updateFileStatus(
  fileId: number,
  status: string,
  score?: number
): void {
  if (score !== undefined) {
    getDb()
      .prepare(
        "UPDATE files SET scan_status = ?, accessibility_score = ? WHERE id = ?"
      )
      .run(status, score, fileId);
  } else {
    getDb()
      .prepare("UPDATE files SET scan_status = ? WHERE id = ?")
      .run(status, fileId);
  }
}

export function setFileHash(fileId: number, fileHash: string): void {
  getDb()
    .prepare("UPDATE files SET file_hash = ? WHERE id = ?")
    .run(fileHash, fileId);
}

export function markFileRuntimeAnalyzed(
  fileId: number,
  analyzed: boolean = true
): void {
  getDb()
    .prepare("UPDATE files SET runtime_analyzed = ? WHERE id = ?")
    .run(analyzed ? 1 : 0, fileId);
}

export function hasFileRuntimeAnalysis(fileId: number): boolean {
  const row = getDb()
    .prepare("SELECT runtime_analyzed FROM files WHERE id = ?")
    .get(fileId) as { runtime_analyzed: number } | undefined;
  return row?.runtime_analyzed === 1;
}

/* ------------------------------------------------------------------ *
 *  Applicable guideline helpers                                       *
 * ------------------------------------------------------------------ */
export function upsertApplicableGuideline(
  fileId: number,
  wcagId: string,
  description: string
): void {
  getDb()
    .prepare(
      `INSERT INTO applicable_guidelines (file_id, wcag_id, description) VALUES (?, ?, ?)
       ON CONFLICT(file_id, wcag_id) DO UPDATE SET description = excluded.description`
    )
    .run(fileId, wcagId, description);
}

export function getIgnoredGuidelines(fileId: number): string[] {
  const rows = getDb()
    .prepare(
      "SELECT wcag_id FROM ignored_guidelines WHERE file_id = ?"
    )
    .all(fileId) as { wcag_id: string }[];
  return rows.map((r) => r.wcag_id);
}

export function getFileId(
  projectId: number,
  filePath: string
): number | null {
  const row = getDb()
    .prepare("SELECT id FROM files WHERE project_id = ? AND path = ?")
    .get(projectId, filePath) as { id: number } | undefined;
  return row?.id ?? null;
}

export function getApplicableGuidelines(
  fileId: number
): Array<{ wcag_id: string; description: string }> {
  return getDb()
    .prepare(
      "SELECT wcag_id, description FROM applicable_guidelines WHERE file_id = ?"
    )
    .all(fileId) as Array<{
      wcag_id: string;
      description: string;
    }>;
}

export function getFailedGuidelines(
  fileId: number
): Array<{ wcag_id: string; description: string }> {
  return getDb()
    .prepare(
      `SELECT DISTINCT ar.guideline AS wcag_id,
              COALESCE(ag.description, ar.guideline, '') AS description
       FROM audit_results ar
       LEFT JOIN applicable_guidelines ag
         ON ag.file_id = ar.file_id
        AND ag.wcag_id = ar.guideline
       WHERE ar.file_id = ?
         AND ar.source = 'llm'
         AND ar.ignored = 0
         AND ar.guideline IS NOT NULL`
    )
    .all(fileId) as Array<{ wcag_id: string; description: string }>;
}

export function clearProjectRuntimeAnalysis(projectId: number): void {
  getDb()
    .prepare(
      `DELETE FROM audit_results
       WHERE source = 'runtime'
         AND file_id IN (SELECT id FROM files WHERE project_id = ?)`
    )
    .run(projectId);

  getDb()
    .prepare(
      `DELETE FROM applicable_guidelines
       WHERE file_id IN (SELECT id FROM files WHERE project_id = ?)`
    )
    .run(projectId);
}

export function clearRuntimeAnalysisForFiles(fileIds: number[]): void {
  if (fileIds.length === 0) return;

  const placeholders = fileIds.map(() => "?").join(", ");

  getDb()
    .prepare(
      `DELETE FROM audit_results
       WHERE source = 'runtime'
         AND file_id IN (${placeholders})`
    )
    .run(...fileIds);

  getDb()
    .prepare(
      `DELETE FROM applicable_guidelines
       WHERE file_id IN (${placeholders})`
    )
    .run(...fileIds);

  getDb()
    .prepare(
      `UPDATE files
       SET runtime_analyzed = 0
       WHERE id IN (${placeholders})`
    )
    .run(...fileIds);
}

export function clearProjectLlmAuditResults(projectId: number): void {
  getDb()
    .prepare(
      `DELETE FROM audit_results
       WHERE source = 'llm'
         AND file_id IN (SELECT id FROM files WHERE project_id = ?)`
    )
    .run(projectId);
}

export function clearAuditResultsForFiles(
  fileIds: number[],
  source?: string
): void {
  if (fileIds.length === 0) return;

  const placeholders = fileIds.map(() => "?").join(", ");
  const params: Array<number | string> = [...fileIds];
  const sourceClause = source ? " AND source = ?" : "";

  if (source) {
    params.push(source);
  }

  getDb()
    .prepare(
      `DELETE FROM audit_results
       WHERE file_id IN (${placeholders})${sourceClause}`
    )
    .run(...params);
}

export function clearApplicableGuidelinesForFiles(fileIds: number[]): void {
  if (fileIds.length === 0) return;

  const placeholders = fileIds.map(() => "?").join(", ");
  getDb()
    .prepare(
      `DELETE FROM applicable_guidelines
       WHERE file_id IN (${placeholders})`
    )
    .run(...fileIds);
}

/* ------------------------------------------------------------------ *
 *  Audit result helpers                                               *
 * ------------------------------------------------------------------ */
export function insertAuditResult(
  fileId: number,
  issueDescription: string,
  guideline: string | null,
  severity: string,
  lineNumber: number | null,
  selector: string | null,
  snippet: string | null,
  suggestion: string | null,
  source: string = "llm"
): number {
  const existingRows = getDb()
    .prepare(
      `SELECT id, issue_description, severity, line_number, selector, snippet, suggestion
       FROM audit_results
       WHERE file_id = ?
         AND COALESCE(guideline, '') = COALESCE(?, '')
         AND source = ?
         AND ignored = 0`
    )
    .all(fileId, guideline, source) as Array<{
    id: number;
    issue_description: string;
    severity: string;
    line_number: number | null;
    selector: string | null;
    snippet: string | null;
    suggestion: string | null;
  }>;

  const existing = existingRows.find((row) =>
    isDuplicateAuditResultCandidate(
      row,
      issueDescription,
      lineNumber,
      selector,
      snippet
    )
  );

  if (existing) {
    const preferIncoming =
      severityRank(severity) > severityRank(existing.severity);
    const primary = preferIncoming
      ? {
          issueDescription,
          severity,
          lineNumber,
          selector,
          snippet,
          suggestion,
        }
      : {
          issueDescription: existing.issue_description,
          severity: existing.severity,
          lineNumber: existing.line_number,
          selector: existing.selector,
          snippet: existing.snippet,
          suggestion: existing.suggestion,
        };
    const secondary = preferIncoming
      ? {
          issueDescription: existing.issue_description,
          severity: existing.severity,
          lineNumber: existing.line_number,
          selector: existing.selector,
          snippet: existing.snippet,
          suggestion: existing.suggestion,
        }
      : {
          issueDescription,
          severity,
          lineNumber,
          selector,
          snippet,
          suggestion,
        };

    getDb()
      .prepare(
        `UPDATE audit_results
         SET issue_description = ?,
             severity = ?,
             line_number = ?,
             selector = ?,
             snippet = ?,
             suggestion = ?
         WHERE id = ?`
      )
      .run(
        primary.issueDescription || secondary.issueDescription || "",
        primary.severity || secondary.severity || "warning",
        primary.lineNumber ?? secondary.lineNumber ?? null,
        choosePreferredText(primary.selector, secondary.selector),
        choosePreferredText(primary.snippet, secondary.snippet),
        choosePreferredText(primary.suggestion, secondary.suggestion),
        existing.id
      );

    return existing.id;
  }

  const row = getDb()
    .prepare(
      `INSERT INTO audit_results
         (file_id, issue_description, guideline, severity, line_number, selector, snippet, suggestion, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    )
    .get(
      fileId,
      issueDescription,
      guideline,
      severity,
      lineNumber,
      selector,
      snippet,
      suggestion,
      source
    ) as { id: number };
  return row.id;
}

export function getAuditResultsBySource(
  fileId: number,
  source: string
): Array<{
  id: number;
  issue_description: string;
  guideline: string | null;
  severity: string;
  line_number: number | null;
  selector: string | null;
  snippet: string | null;
  suggestion: string | null;
  ignored: number;
}> {
  return getDb()
    .prepare(
      `SELECT id, issue_description, guideline, severity, line_number, selector, snippet, suggestion, ignored
       FROM audit_results
       WHERE file_id = ? AND source = ?
       ORDER BY id ASC`
    )
    .all(fileId, source) as Array<{
    id: number;
    issue_description: string;
    guideline: string | null;
    severity: string;
    line_number: number | null;
    selector: string | null;
    snippet: string | null;
    suggestion: string | null;
    ignored: number;
  }>;
}

export function getProjectAuditSnapshot(
  rootPath: string
): ProjectAuditSnapshotFile[] {
  const rows = getDb()
    .prepare(
      `SELECT f.id AS file_id,
              f.path AS file_path,
              f.file_hash AS file_hash,
              f.scan_status,
              f.runtime_analyzed,
              f.accessibility_score,
              ar.id AS issue_id,
              ar.issue_description,
              ar.guideline,
              ar.severity,
              ar.line_number,
              ar.selector,
              ar.snippet,
              ar.suggestion,
              ar.ignored,
              ar.source
       FROM files f
       INNER JOIN projects p ON p.id = f.project_id
       LEFT JOIN audit_results ar ON ar.file_id = f.id
       WHERE p.root_path = ?
       ORDER BY f.path ASC, ar.id ASC`
    )
    .all(rootPath) as ProjectAuditSnapshotRow[];

  const files = new Map<number, ProjectAuditSnapshotFile>();

  for (const row of rows) {
    let file = files.get(row.file_id);
    if (!file) {
      file = {
        filePath: row.file_path,
        fileHash: row.file_hash,
        scanStatus: row.scan_status,
        runtimeAnalyzed: row.runtime_analyzed === 1,
        accessibilityScore:
          typeof row.accessibility_score === "number"
            ? row.accessibility_score
            : null,
        results: [],
      };
      files.set(row.file_id, file);
    }

    if (row.issue_id === null) {
      continue;
    }

    file.results.push({
      id: String(row.issue_id),
      filePath: row.file_path,
      guideline: row.guideline || "Unknown guideline",
      severity: row.severity || "warning",
      source: row.source || undefined,
      snippet: row.snippet || "",
      ignored: row.ignored === 1,
      lineNumber: row.line_number ?? undefined,
      selector: row.selector || undefined,
      suggestion: row.suggestion || undefined,
      issueDescription: row.issue_description || undefined,
    });
  }

  return [...files.values()];
}

function severityRank(severity: string | null | undefined): number {
  return SEVERITY_RANK[String(severity || "warning").toLowerCase()] || 0;
}

function normalizeAuditText(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function choosePreferredText(
  primary: string | null | undefined,
  secondary: string | null | undefined
): string | null {
  const a = normalizeAuditText(primary);
  const b = normalizeAuditText(secondary);

  if (!a) return b || null;
  if (!b) return a;
  return a.length >= b.length ? a : b;
}

function isDuplicateAuditResultCandidate(
  row: {
    line_number: number | null;
    selector: string | null;
    snippet: string | null;
    issue_description: string;
  },
  issueDescription: string,
  lineNumber: number | null,
  selector: string | null,
  snippet: string | null
): boolean {
  const existingSelector = normalizeAuditText(row.selector);
  const incomingSelector = normalizeAuditText(selector);
  const existingSnippet = normalizeAuditText(row.snippet);
  const incomingSnippet = normalizeAuditText(snippet);
  const existingDescription = normalizeAuditText(row.issue_description);
  const incomingDescription = normalizeAuditText(issueDescription);

  if (row.line_number !== null || lineNumber !== null || existingSelector || incomingSelector) {
    return (
      row.line_number === lineNumber &&
      existingSelector === incomingSelector &&
      existingSnippet === incomingSnippet &&
      existingDescription === incomingDescription
    );
  }

  if (existingSnippet || incomingSnippet) {
    return (
      existingSnippet === incomingSnippet &&
      existingDescription === incomingDescription
    );
  }

  return existingDescription === incomingDescription;
}

export function ignoreIssue(auditResultId: number): void {
  const row = getDb()
    .prepare(
      "SELECT file_id, guideline FROM audit_results WHERE id = ?"
    )
    .get(auditResultId) as
    | { file_id: number; guideline: string | null }
    | undefined;

  if (!row) return;

  // Mark the audit result itself as ignored
  getDb()
    .prepare("UPDATE audit_results SET ignored = 1 WHERE id = ?")
    .run(auditResultId);

  // If the result references a guideline, persist the ignore separately from applicability.
  if (row.guideline) {
    getDb()
      .prepare(
        `INSERT INTO ignored_guidelines (file_id, wcag_id)
         VALUES (?, ?)
         ON CONFLICT(file_id, wcag_id) DO NOTHING`
      )
      .run(row.file_id, row.guideline);
  }

  syncIgnoredIssueInReports(auditResultId);
}

function mapStoredReportRow(row: ReportRow): StoredReportPayload {
  const payload = JSON.parse(row.payload_json) as StoredReportPayload;
  return {
    ...payload,
    reportId: String(row.id),
    filePath: row.file_path,
    fileHash: row.file_hash,
    createdAt: row.created_at,
    overallAccessibilityScore: row.overall_accessibility_score,
  };
}

export function insertStoredReport(args: {
  projectId: number;
  filePath: string;
  fileHash: string;
  overallAccessibilityScore: number;
  payload: Omit<
    StoredReportPayload,
    "reportId" | "filePath" | "fileHash" | "createdAt" | "source"
  > & { source?: "opened" | "generated" };
}): StoredReportPayload {
  const row = getDb()
    .prepare(
      `INSERT INTO reports (
         project_id,
         file_path,
         file_hash,
         overall_accessibility_score,
         payload_json
       )
       VALUES (?, ?, ?, ?, ?)
       RETURNING id, project_id, file_path, file_hash, overall_accessibility_score, created_at, payload_json`
    )
    .get(
      args.projectId,
      args.filePath,
      args.fileHash,
      args.overallAccessibilityScore,
      JSON.stringify({
        ...args.payload,
        source: args.payload.source || "generated",
      })
    ) as ReportRow;

  return mapStoredReportRow(row);
}

export function getLatestStoredReportByFilePath(
  filePath: string
): StoredReportPayload | null {
  const row = getDb()
    .prepare(
      `SELECT id,
              project_id,
              file_path,
              file_hash,
              overall_accessibility_score,
              created_at,
              payload_json
       FROM reports
       WHERE file_path = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`
    )
    .get(filePath) as ReportRow | undefined;

  return row ? mapStoredReportRow(row) : null;
}

export function getLatestStoredReportsByProjectRootPath(
  rootPath: string
): StoredReportPayload[] {
  const rows = getDb()
    .prepare(
      `SELECT r.id,
              r.project_id,
              r.file_path,
              r.file_hash,
              r.overall_accessibility_score,
              r.created_at,
              r.payload_json
       FROM reports r
       INNER JOIN projects p ON p.id = r.project_id
       INNER JOIN (
         SELECT file_path, MAX(id) AS latest_id
         FROM reports
         WHERE project_id = (SELECT id FROM projects WHERE root_path = ?)
         GROUP BY file_path
       ) latest ON latest.latest_id = r.id
       WHERE p.root_path = ?
       ORDER BY r.file_path ASC`
    )
    .all(rootPath, rootPath) as ReportRow[];

  return rows.map(mapStoredReportRow);
}

export function getStoredReportById(reportId: number): StoredReportPayload | null {
  const row = getDb()
    .prepare(
      `SELECT id,
              project_id,
              file_path,
              file_hash,
              overall_accessibility_score,
              created_at,
              payload_json
       FROM reports
       WHERE id = ?`
    )
    .get(reportId) as ReportRow | undefined;

  return row ? mapStoredReportRow(row) : null;
}

function syncIgnoredIssueInReports(auditResultId: number): void {
  const rows = getDb()
    .prepare("SELECT id, payload_json FROM reports")
    .all() as Array<{ id: number; payload_json: string }>;

  for (const row of rows) {
    let payload: StoredReportPayload;

    try {
      payload = JSON.parse(row.payload_json) as StoredReportPayload;
    } catch {
      continue;
    }

    let changed = false;
    const nextResults = (payload.results || []).map((result) => {
      if (String(result.id) !== String(auditResultId) || result.ignored) {
        return result;
      }

      changed = true;
      return {
        ...result,
        ignored: true,
      };
    });

    if (!changed) {
      continue;
    }

    const nextGroupedIssues = (payload.groupedIssues || []).map((group) => ({
      ...group,
      issues: group.issues.map((issue) =>
        String(issue.id) === String(auditResultId)
          ? { ...issue, ignored: true }
          : issue
      ),
    }));

    const nextFileEntries = (payload.fileEntries || []).map((entry) => ({
      ...entry,
      issueCount: nextResults.filter(
        (result) => result.filePath === entry.filePath && !result.ignored
      ).length,
    }));

    const nextCounts = nextResults.reduce(
      (acc, result) => {
        if (!result.ignored) {
          const severity = String(result.severity || "warning").toLowerCase();
          if (severity === "error" || severity === "warning" || severity === "info") {
            acc[severity] += 1;
          }
        }
        return acc;
      },
      { error: 0, warning: 0, info: 0 } as Record<"error" | "warning" | "info", number>
    );

    getDb()
      .prepare("UPDATE reports SET payload_json = ? WHERE id = ?")
      .run(
        JSON.stringify({
          ...payload,
          results: nextResults,
          groupedIssues: nextGroupedIssues,
          fileEntries: nextFileEntries,
          counts: nextCounts,
        }),
        row.id
      );
  }
}

/* ------------------------------------------------------------------ *
 *  Session helpers                                                    *
 * ------------------------------------------------------------------ */
export function createSession(query: string, rootPath?: string): number {
  const row = getDb()
    .prepare(
      `INSERT INTO sessions (query, root_path) VALUES (?, ?)
       RETURNING id`
    )
    .get(query, rootPath || null) as { id: number };
  return row.id;
}

export function endSession(
  sessionId: number,
  status: "completed" | "error" = "completed"
): void {
  getDb()
    .prepare(
      "UPDATE sessions SET ended_at = CURRENT_TIMESTAMP, status = ? WHERE id = ?"
    )
    .run(status, sessionId);
}

export function getAllSessions(): Array<{
  id: number;
  query: string;
  rootPath: string | null;
  startedAt: string;
  endedAt: string | null;
  status: string;
  callCount: number;
  totalTokens: number;
}> {
  return getDb()
    .prepare(
      `SELECT s.id,
              s.query,
              s.root_path AS rootPath,
              s.started_at AS startedAt,
              s.ended_at AS endedAt,
              s.status,
              COUNT(l.id) AS callCount,
              COALESCE(SUM(l.total_tokens), 0) AS totalTokens
       FROM sessions s
       LEFT JOIN llm_api_calls l ON l.session_id = s.id
       GROUP BY s.id
       ORDER BY s.started_at DESC`
    )
    .all() as Array<{
    id: number;
    query: string;
    rootPath: string | null;
    startedAt: string;
    endedAt: string | null;
    status: string;
    callCount: number;
    totalTokens: number;
  }>;
}

export function getSessionById(sessionId: number): {
  id: number;
  query: string;
  rootPath: string | null;
  startedAt: string;
  endedAt: string | null;
  status: string;
} | null {
  const row = getDb()
    .prepare(
      `SELECT id, query, root_path AS rootPath, started_at AS startedAt, ended_at AS endedAt, status
       FROM sessions WHERE id = ?`
    )
    .get(sessionId) as {
    id: number;
    query: string;
    rootPath: string | null;
    startedAt: string;
    endedAt: string | null;
    status: string;
  } | undefined;
  return row || null;
}

/* ------------------------------------------------------------------ *
 *  LLM API call log helpers                                           *
 * ------------------------------------------------------------------ */
export function insertLlmApiCall(args: {
  sessionId: number | null;
  threadId: string | null;
  phase: string | null;
  model: string;
  systemPromptPreview: string | null;
  userPromptPreview: string | null;
  responsePreview: string | null;
  fullUserPrompt: string | null;
  fullResponse: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  isJsonMode: boolean;
}): number {
  const row = getDb()
    .prepare(
      `INSERT INTO llm_api_calls (
         session_id, thread_id, phase, model,
         system_prompt_preview, user_prompt_preview, response_preview,
         full_user_prompt, full_response,
         prompt_tokens, completion_tokens, total_tokens,
         duration_ms, is_json_mode
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    )
    .get(
      args.sessionId,
      args.threadId,
      args.phase,
      args.model,
      args.systemPromptPreview,
      args.userPromptPreview,
      args.responsePreview,
      args.fullUserPrompt,
      args.fullResponse,
      args.promptTokens,
      args.completionTokens,
      args.totalTokens,
      args.durationMs,
      args.isJsonMode ? 1 : 0
    ) as { id: number };
  return row.id;
}

export function getLlmApiCallsBySession(sessionId: number): Array<{
  id: number;
  threadId: string | null;
  phase: string | null;
  model: string;
  systemPromptPreview: string | null;
  userPromptPreview: string | null;
  responsePreview: string | null;
  fullUserPrompt: string | null;
  fullResponse: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  isJsonMode: boolean;
  createdAt: string;
}> {
  return getDb()
    .prepare(
      `SELECT id, thread_id AS threadId, phase, model,
              system_prompt_preview AS systemPromptPreview,
              user_prompt_preview AS userPromptPreview,
              response_preview AS responsePreview,
              full_user_prompt AS fullUserPrompt,
              full_response AS fullResponse,
              prompt_tokens AS promptTokens,
              completion_tokens AS completionTokens,
              total_tokens AS totalTokens,
              duration_ms AS durationMs,
              is_json_mode AS isJsonMode,
              created_at AS createdAt
       FROM llm_api_calls
       WHERE session_id = ?
       ORDER BY created_at ASC`
    )
    .all(sessionId) as Array<{
    id: number;
    threadId: string | null;
    phase: string | null;
    model: string;
    systemPromptPreview: string | null;
    userPromptPreview: string | null;
    responsePreview: string | null;
    fullUserPrompt: string | null;
    fullResponse: string | null;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    durationMs: number | null;
    isJsonMode: boolean;
    createdAt: string;
  }>;
}

export function getAllLlmApiCalls(): Array<{
  id: number;
  sessionId: number | null;
  threadId: string | null;
  phase: string | null;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  createdAt: string;
}> {
  return getDb()
    .prepare(
      `SELECT id, session_id AS sessionId, thread_id AS threadId, phase, model,
              prompt_tokens AS promptTokens,
              completion_tokens AS completionTokens,
              total_tokens AS totalTokens,
              duration_ms AS durationMs,
              created_at AS createdAt
       FROM llm_api_calls
       ORDER BY created_at DESC
       LIMIT 500`
    )
    .all() as Array<{
    id: number;
    sessionId: number | null;
    threadId: string | null;
    phase: string | null;
    model: string;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    durationMs: number | null;
    createdAt: string;
  }>;
}

/* ------------------------------------------------------------------ *
 *  LLM Provider helpers                                               *
 * ------------------------------------------------------------------ */
export interface LlmProviderRow {
  id: number;
  name: string;
  providerType: string;
  configJson: string;
  isActive: boolean;
  createdAt: string;
}

export function insertLlmProvider(args: {
  name: string;
  providerType: string;
  configJson: string;
  isActive?: boolean;
}): number {
  if (args.isActive) {
    getDb().prepare("UPDATE llm_providers SET is_active = 0").run();
  }
  const row = getDb()
    .prepare(
      `INSERT INTO llm_providers (name, provider_type, config_json, is_active)
       VALUES (?, ?, ?, ?)
       RETURNING id`
    )
    .get(args.name, args.providerType, args.configJson, args.isActive ? 1 : 0) as { id: number };
  return row.id;
}

export function updateLlmProvider(
  id: number,
  args: { name: string; providerType: string; configJson: string }
): void {
  getDb()
    .prepare(
      `UPDATE llm_providers SET name = ?, provider_type = ?, config_json = ? WHERE id = ?`
    )
    .run(args.name, args.providerType, args.configJson, id);
}

export function setActiveLlmProvider(id: number): void {
  const txn = getDb().transaction(() => {
    getDb().prepare("UPDATE llm_providers SET is_active = 0").run();
    getDb()
      .prepare("UPDATE llm_providers SET is_active = 1 WHERE id = ?")
      .run(id);
  });
  txn();
}

export function deleteLlmProvider(id: number): void {
  getDb().prepare("DELETE FROM llm_providers WHERE id = ?").run(id);
}

export function getAllLlmProviders(): LlmProviderRow[] {
  return getDb()
    .prepare(
      `SELECT id, name, provider_type AS providerType, config_json AS configJson,
              is_active AS isActive, created_at AS createdAt
       FROM llm_providers
       ORDER BY is_active DESC, created_at ASC`
    )
    .all()
    .map((row: any) => ({ ...row, isActive: row.isActive === 1 })) as LlmProviderRow[];
}

export function getActiveLlmProvider(): LlmProviderRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, name, provider_type AS providerType, config_json AS configJson,
              is_active AS isActive, created_at AS createdAt
       FROM llm_providers
       WHERE is_active = 1
       LIMIT 1`
    )
    .get() as any | undefined;
  if (!row) return null;
  return { ...row, isActive: row.isActive === 1 } as LlmProviderRow;
}

export function getLlmProviderById(id: number): LlmProviderRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, name, provider_type AS providerType, config_json AS configJson,
              is_active AS isActive, created_at AS createdAt
       FROM llm_providers
       WHERE id = ?`
    )
    .get(id) as any | undefined;
  if (!row) return null;
  return { ...row, isActive: row.isActive === 1 } as LlmProviderRow;
}
