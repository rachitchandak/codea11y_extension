import Database from "better-sqlite3";
import * as path from "path";

let db: Database.Database;

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

  const auditResultCols = db
    .prepare("PRAGMA table_info(audit_results)")
    .all() as Array<{ name: string }>;
  if (!auditResultCols.some((c) => c.name === "source")) {
    db.exec(
      "ALTER TABLE audit_results ADD COLUMN source TEXT NOT NULL DEFAULT 'llm'"
    );
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
 *  Guideline helpers                                                  *
 * ------------------------------------------------------------------ */
export function upsertGuideline(
  fileId: number,
  wcagId: string,
  description: string,
  status = "active"
): void {
  getDb()
    .prepare(
      `INSERT INTO guidelines (file_id, wcag_id, description, status) VALUES (?, ?, ?, ?)
       ON CONFLICT(file_id, wcag_id) DO UPDATE SET description = excluded.description, status = excluded.status`
    )
    .run(fileId, wcagId, description, status);
}

export function getIgnoredGuidelines(fileId: number): string[] {
  const rows = getDb()
    .prepare(
      "SELECT wcag_id FROM guidelines WHERE file_id = ? AND status = 'ignored'"
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

export function getActiveGuidelines(
  fileId: number
): Array<{ wcag_id: string; description: string }> {
  return getDb()
    .prepare(
      "SELECT wcag_id, description FROM guidelines WHERE file_id = ? AND status NOT IN ('ignored', 'na')"
    )
    .all(fileId) as Array<{ wcag_id: string; description: string }>;
}

export function getFileGuidelines(
  fileId: number
): Array<{ wcag_id: string; description: string; status: string }> {
  return getDb()
    .prepare(
      "SELECT wcag_id, description, status FROM guidelines WHERE file_id = ?"
    )
    .all(fileId) as Array<{
      wcag_id: string;
      description: string;
      status: string;
    }>;
}

export function updateGuidelineStatus(
  fileId: number,
  wcagId: string,
  status: string
): void {
  getDb()
    .prepare(
      "UPDATE guidelines SET status = ? WHERE file_id = ? AND wcag_id = ?"
    )
    .run(status, fileId, wcagId);
}

export function getFailedGuidelines(
  fileId: number
): Array<{ wcag_id: string; description: string }> {
  return getDb()
    .prepare(
      "SELECT wcag_id, description FROM guidelines WHERE file_id = ? AND status = 'failed'"
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
      `DELETE FROM guidelines
       WHERE file_id IN (SELECT id FROM files WHERE project_id = ?)
         AND (
           wcag_id LIKE '%1.4.3%'
           OR wcag_id LIKE '%1.4.6%'
           OR wcag_id LIKE '%1.4.11%'
         )`
    )
    .run(projectId);
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

  if (row.line_number !== null || lineNumber !== null || existingSelector || incomingSelector) {
    return row.line_number === lineNumber && existingSelector === incomingSelector;
  }

  const existingSnippet = normalizeAuditText(row.snippet);
  const incomingSnippet = normalizeAuditText(snippet);
  if (existingSnippet || incomingSnippet) {
    return existingSnippet === incomingSnippet;
  }

  return normalizeAuditText(row.issue_description) === normalizeAuditText(issueDescription);
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

  // If the result references a guideline, mark it ignored for future audits
  if (row.guideline) {
    getDb()
      .prepare(
        `INSERT INTO guidelines (file_id, wcag_id, description, status)
         VALUES (?, ?, 'Ignored by user', 'ignored')
         ON CONFLICT(file_id, wcag_id) DO UPDATE SET status = 'ignored'`
      )
      .run(row.file_id, row.guideline);
  }
}
