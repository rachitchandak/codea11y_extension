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
exports.initDatabase = initDatabase;
exports.getDb = getDb;
exports.upsertProject = upsertProject;
exports.upsertFile = upsertFile;
exports.updateFileStatus = updateFileStatus;
exports.setFileHash = setFileHash;
exports.markFileRuntimeAnalyzed = markFileRuntimeAnalyzed;
exports.hasFileRuntimeAnalysis = hasFileRuntimeAnalysis;
exports.upsertApplicableGuideline = upsertApplicableGuideline;
exports.getIgnoredGuidelines = getIgnoredGuidelines;
exports.getFileId = getFileId;
exports.getApplicableGuidelines = getApplicableGuidelines;
exports.getFailedGuidelines = getFailedGuidelines;
exports.clearProjectRuntimeAnalysis = clearProjectRuntimeAnalysis;
exports.clearRuntimeAnalysisForFiles = clearRuntimeAnalysisForFiles;
exports.clearProjectLlmAuditResults = clearProjectLlmAuditResults;
exports.clearAuditResultsForFiles = clearAuditResultsForFiles;
exports.clearApplicableGuidelinesForFiles = clearApplicableGuidelinesForFiles;
exports.insertAuditResult = insertAuditResult;
exports.getAuditResultsBySource = getAuditResultsBySource;
exports.getProjectAuditSnapshot = getProjectAuditSnapshot;
exports.ignoreIssue = ignoreIssue;
exports.insertStoredReport = insertStoredReport;
exports.getLatestStoredReportByFilePath = getLatestStoredReportByFilePath;
exports.getLatestStoredReportsByProjectRootPath = getLatestStoredReportsByProjectRootPath;
exports.getStoredReportById = getStoredReportById;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path = __importStar(require("path"));
let db;
const SEVERITY_RANK = {
    info: 1,
    warning: 2,
    error: 3,
};
/* ------------------------------------------------------------------ *
 *  Initialize SQLite database and create schema                      *
 * ------------------------------------------------------------------ */
function initDatabase(dbDir) {
    const dbPath = path.join(dbDir, "codea11y.db");
    db = new better_sqlite3_1.default(dbPath);
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
  `);
    // Migration: add `source` column for databases created before this change
    const cols = db
        .prepare("PRAGMA table_info(files)")
        .all();
    if (!cols.some((c) => c.name === "runtime_analyzed")) {
        db.exec("ALTER TABLE files ADD COLUMN runtime_analyzed INTEGER NOT NULL DEFAULT 0");
    }
    if (!cols.some((c) => c.name === "file_hash")) {
        db.exec("ALTER TABLE files ADD COLUMN file_hash TEXT");
    }
    const auditResultCols = db
        .prepare("PRAGMA table_info(audit_results)")
        .all();
    if (!auditResultCols.some((c) => c.name === "source")) {
        db.exec("ALTER TABLE audit_results ADD COLUMN source TEXT NOT NULL DEFAULT 'llm'");
    }
    // One-time migration for splitting runtime applicability from user ignores.
    const splitMigration = db
        .prepare("SELECT value FROM schema_meta WHERE key = 'guideline_split_v1'")
        .get();
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
function getDb() {
    if (!db) {
        throw new Error("Database not initialized. Call initDatabase() first.");
    }
    return db;
}
/* ------------------------------------------------------------------ *
 *  Project helpers                                                    *
 * ------------------------------------------------------------------ */
function upsertProject(name, rootPath) {
    const row = getDb()
        .prepare(`INSERT INTO projects (name, root_path) VALUES (?, ?)
       ON CONFLICT(root_path) DO UPDATE SET name = excluded.name
       RETURNING id`)
        .get(name, rootPath);
    return row.id;
}
/* ------------------------------------------------------------------ *
 *  File helpers                                                       *
 * ------------------------------------------------------------------ */
function upsertFile(projectId, filePath) {
    const row = getDb()
        .prepare(`INSERT INTO files (project_id, path) VALUES (?, ?)
       ON CONFLICT(project_id, path) DO UPDATE SET scan_status = 'pending'
       RETURNING id`)
        .get(projectId, filePath);
    return row.id;
}
function updateFileStatus(fileId, status, score) {
    if (score !== undefined) {
        getDb()
            .prepare("UPDATE files SET scan_status = ?, accessibility_score = ? WHERE id = ?")
            .run(status, score, fileId);
    }
    else {
        getDb()
            .prepare("UPDATE files SET scan_status = ? WHERE id = ?")
            .run(status, fileId);
    }
}
function setFileHash(fileId, fileHash) {
    getDb()
        .prepare("UPDATE files SET file_hash = ? WHERE id = ?")
        .run(fileHash, fileId);
}
function markFileRuntimeAnalyzed(fileId, analyzed = true) {
    getDb()
        .prepare("UPDATE files SET runtime_analyzed = ? WHERE id = ?")
        .run(analyzed ? 1 : 0, fileId);
}
function hasFileRuntimeAnalysis(fileId) {
    const row = getDb()
        .prepare("SELECT runtime_analyzed FROM files WHERE id = ?")
        .get(fileId);
    return row?.runtime_analyzed === 1;
}
/* ------------------------------------------------------------------ *
 *  Applicable guideline helpers                                       *
 * ------------------------------------------------------------------ */
function upsertApplicableGuideline(fileId, wcagId, description) {
    getDb()
        .prepare(`INSERT INTO applicable_guidelines (file_id, wcag_id, description) VALUES (?, ?, ?)
       ON CONFLICT(file_id, wcag_id) DO UPDATE SET description = excluded.description`)
        .run(fileId, wcagId, description);
}
function getIgnoredGuidelines(fileId) {
    const rows = getDb()
        .prepare("SELECT wcag_id FROM ignored_guidelines WHERE file_id = ?")
        .all(fileId);
    return rows.map((r) => r.wcag_id);
}
function getFileId(projectId, filePath) {
    const row = getDb()
        .prepare("SELECT id FROM files WHERE project_id = ? AND path = ?")
        .get(projectId, filePath);
    return row?.id ?? null;
}
function getApplicableGuidelines(fileId) {
    return getDb()
        .prepare("SELECT wcag_id, description FROM applicable_guidelines WHERE file_id = ?")
        .all(fileId);
}
function getFailedGuidelines(fileId) {
    return getDb()
        .prepare(`SELECT DISTINCT ar.guideline AS wcag_id,
              COALESCE(ag.description, ar.guideline, '') AS description
       FROM audit_results ar
       LEFT JOIN applicable_guidelines ag
         ON ag.file_id = ar.file_id
        AND ag.wcag_id = ar.guideline
       WHERE ar.file_id = ?
         AND ar.source = 'llm'
         AND ar.ignored = 0
         AND ar.guideline IS NOT NULL`)
        .all(fileId);
}
function clearProjectRuntimeAnalysis(projectId) {
    getDb()
        .prepare(`DELETE FROM audit_results
       WHERE source = 'runtime'
         AND file_id IN (SELECT id FROM files WHERE project_id = ?)`)
        .run(projectId);
    getDb()
        .prepare(`DELETE FROM applicable_guidelines
       WHERE file_id IN (SELECT id FROM files WHERE project_id = ?)`)
        .run(projectId);
}
function clearRuntimeAnalysisForFiles(fileIds) {
    if (fileIds.length === 0)
        return;
    const placeholders = fileIds.map(() => "?").join(", ");
    getDb()
        .prepare(`DELETE FROM audit_results
       WHERE source = 'runtime'
         AND file_id IN (${placeholders})`)
        .run(...fileIds);
    getDb()
        .prepare(`DELETE FROM applicable_guidelines
       WHERE file_id IN (${placeholders})`)
        .run(...fileIds);
    getDb()
        .prepare(`UPDATE files
       SET runtime_analyzed = 0
       WHERE id IN (${placeholders})`)
        .run(...fileIds);
}
function clearProjectLlmAuditResults(projectId) {
    getDb()
        .prepare(`DELETE FROM audit_results
       WHERE source = 'llm'
         AND file_id IN (SELECT id FROM files WHERE project_id = ?)`)
        .run(projectId);
}
function clearAuditResultsForFiles(fileIds, source) {
    if (fileIds.length === 0)
        return;
    const placeholders = fileIds.map(() => "?").join(", ");
    const params = [...fileIds];
    const sourceClause = source ? " AND source = ?" : "";
    if (source) {
        params.push(source);
    }
    getDb()
        .prepare(`DELETE FROM audit_results
       WHERE file_id IN (${placeholders})${sourceClause}`)
        .run(...params);
}
function clearApplicableGuidelinesForFiles(fileIds) {
    if (fileIds.length === 0)
        return;
    const placeholders = fileIds.map(() => "?").join(", ");
    getDb()
        .prepare(`DELETE FROM applicable_guidelines
       WHERE file_id IN (${placeholders})`)
        .run(...fileIds);
}
/* ------------------------------------------------------------------ *
 *  Audit result helpers                                               *
 * ------------------------------------------------------------------ */
function insertAuditResult(fileId, issueDescription, guideline, severity, lineNumber, selector, snippet, suggestion, source = "llm") {
    const existingRows = getDb()
        .prepare(`SELECT id, issue_description, severity, line_number, selector, snippet, suggestion
       FROM audit_results
       WHERE file_id = ?
         AND COALESCE(guideline, '') = COALESCE(?, '')
         AND source = ?
         AND ignored = 0`)
        .all(fileId, guideline, source);
    const existing = existingRows.find((row) => isDuplicateAuditResultCandidate(row, issueDescription, lineNumber, selector, snippet));
    if (existing) {
        const preferIncoming = severityRank(severity) > severityRank(existing.severity);
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
            .prepare(`UPDATE audit_results
         SET issue_description = ?,
             severity = ?,
             line_number = ?,
             selector = ?,
             snippet = ?,
             suggestion = ?
         WHERE id = ?`)
            .run(primary.issueDescription || secondary.issueDescription || "", primary.severity || secondary.severity || "warning", primary.lineNumber ?? secondary.lineNumber ?? null, choosePreferredText(primary.selector, secondary.selector), choosePreferredText(primary.snippet, secondary.snippet), choosePreferredText(primary.suggestion, secondary.suggestion), existing.id);
        return existing.id;
    }
    const row = getDb()
        .prepare(`INSERT INTO audit_results
         (file_id, issue_description, guideline, severity, line_number, selector, snippet, suggestion, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`)
        .get(fileId, issueDescription, guideline, severity, lineNumber, selector, snippet, suggestion, source);
    return row.id;
}
function getAuditResultsBySource(fileId, source) {
    return getDb()
        .prepare(`SELECT id, issue_description, guideline, severity, line_number, selector, snippet, suggestion, ignored
       FROM audit_results
       WHERE file_id = ? AND source = ?
       ORDER BY id ASC`)
        .all(fileId, source);
}
function getProjectAuditSnapshot(rootPath) {
    const rows = getDb()
        .prepare(`SELECT f.id AS file_id,
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
       ORDER BY f.path ASC, ar.id ASC`)
        .all(rootPath);
    const files = new Map();
    for (const row of rows) {
        let file = files.get(row.file_id);
        if (!file) {
            file = {
                filePath: row.file_path,
                fileHash: row.file_hash,
                scanStatus: row.scan_status,
                runtimeAnalyzed: row.runtime_analyzed === 1,
                accessibilityScore: typeof row.accessibility_score === "number"
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
function severityRank(severity) {
    return SEVERITY_RANK[String(severity || "warning").toLowerCase()] || 0;
}
function normalizeAuditText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}
function choosePreferredText(primary, secondary) {
    const a = normalizeAuditText(primary);
    const b = normalizeAuditText(secondary);
    if (!a)
        return b || null;
    if (!b)
        return a;
    return a.length >= b.length ? a : b;
}
function isDuplicateAuditResultCandidate(row, issueDescription, lineNumber, selector, snippet) {
    const existingSelector = normalizeAuditText(row.selector);
    const incomingSelector = normalizeAuditText(selector);
    const existingSnippet = normalizeAuditText(row.snippet);
    const incomingSnippet = normalizeAuditText(snippet);
    const existingDescription = normalizeAuditText(row.issue_description);
    const incomingDescription = normalizeAuditText(issueDescription);
    if (row.line_number !== null || lineNumber !== null || existingSelector || incomingSelector) {
        return (row.line_number === lineNumber &&
            existingSelector === incomingSelector &&
            existingSnippet === incomingSnippet &&
            existingDescription === incomingDescription);
    }
    if (existingSnippet || incomingSnippet) {
        return (existingSnippet === incomingSnippet &&
            existingDescription === incomingDescription);
    }
    return existingDescription === incomingDescription;
}
function ignoreIssue(auditResultId) {
    const row = getDb()
        .prepare("SELECT file_id, guideline FROM audit_results WHERE id = ?")
        .get(auditResultId);
    if (!row)
        return;
    // Mark the audit result itself as ignored
    getDb()
        .prepare("UPDATE audit_results SET ignored = 1 WHERE id = ?")
        .run(auditResultId);
    // If the result references a guideline, persist the ignore separately from applicability.
    if (row.guideline) {
        getDb()
            .prepare(`INSERT INTO ignored_guidelines (file_id, wcag_id)
         VALUES (?, ?)
         ON CONFLICT(file_id, wcag_id) DO NOTHING`)
            .run(row.file_id, row.guideline);
    }
    syncIgnoredIssueInReports(auditResultId);
}
function mapStoredReportRow(row) {
    const payload = JSON.parse(row.payload_json);
    return {
        ...payload,
        reportId: String(row.id),
        filePath: row.file_path,
        fileHash: row.file_hash,
        createdAt: row.created_at,
        overallAccessibilityScore: row.overall_accessibility_score,
    };
}
function insertStoredReport(args) {
    const row = getDb()
        .prepare(`INSERT INTO reports (
         project_id,
         file_path,
         file_hash,
         overall_accessibility_score,
         payload_json
       )
       VALUES (?, ?, ?, ?, ?)
       RETURNING id, project_id, file_path, file_hash, overall_accessibility_score, created_at, payload_json`)
        .get(args.projectId, args.filePath, args.fileHash, args.overallAccessibilityScore, JSON.stringify({
        ...args.payload,
        source: args.payload.source || "generated",
    }));
    return mapStoredReportRow(row);
}
function getLatestStoredReportByFilePath(filePath) {
    const row = getDb()
        .prepare(`SELECT id,
              project_id,
              file_path,
              file_hash,
              overall_accessibility_score,
              created_at,
              payload_json
       FROM reports
       WHERE file_path = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`)
        .get(filePath);
    return row ? mapStoredReportRow(row) : null;
}
function getLatestStoredReportsByProjectRootPath(rootPath) {
    const rows = getDb()
        .prepare(`SELECT r.id,
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
       ORDER BY r.file_path ASC`)
        .all(rootPath, rootPath);
    return rows.map(mapStoredReportRow);
}
function getStoredReportById(reportId) {
    const row = getDb()
        .prepare(`SELECT id,
              project_id,
              file_path,
              file_hash,
              overall_accessibility_score,
              created_at,
              payload_json
       FROM reports
       WHERE id = ?`)
        .get(reportId);
    return row ? mapStoredReportRow(row) : null;
}
function syncIgnoredIssueInReports(auditResultId) {
    const rows = getDb()
        .prepare("SELECT id, payload_json FROM reports")
        .all();
    for (const row of rows) {
        let payload;
        try {
            payload = JSON.parse(row.payload_json);
        }
        catch {
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
            issues: group.issues.map((issue) => String(issue.id) === String(auditResultId)
                ? { ...issue, ignored: true }
                : issue),
        }));
        const nextFileEntries = (payload.fileEntries || []).map((entry) => ({
            ...entry,
            issueCount: nextResults.filter((result) => result.filePath === entry.filePath && !result.ignored).length,
        }));
        const nextCounts = nextResults.reduce((acc, result) => {
            if (!result.ignored) {
                const severity = String(result.severity || "warning").toLowerCase();
                if (severity === "error" || severity === "warning" || severity === "info") {
                    acc[severity] += 1;
                }
            }
            return acc;
        }, { error: 0, warning: 0, info: 0 });
        getDb()
            .prepare("UPDATE reports SET payload_json = ? WHERE id = ?")
            .run(JSON.stringify({
            ...payload,
            results: nextResults,
            groupedIssues: nextGroupedIssues,
            fileEntries: nextFileEntries,
            counts: nextCounts,
        }), row.id);
    }
}
//# sourceMappingURL=db.js.map