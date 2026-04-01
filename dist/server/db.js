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
exports.markFileRuntimeAnalyzed = markFileRuntimeAnalyzed;
exports.hasFileRuntimeAnalysis = hasFileRuntimeAnalysis;
exports.upsertGuideline = upsertGuideline;
exports.getIgnoredGuidelines = getIgnoredGuidelines;
exports.getFileId = getFileId;
exports.getActiveGuidelines = getActiveGuidelines;
exports.getFileGuidelines = getFileGuidelines;
exports.updateGuidelineStatus = updateGuidelineStatus;
exports.getFailedGuidelines = getFailedGuidelines;
exports.clearProjectRuntimeAnalysis = clearProjectRuntimeAnalysis;
exports.insertAuditResult = insertAuditResult;
exports.getAuditResultsBySource = getAuditResultsBySource;
exports.ignoreIssue = ignoreIssue;
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
        .all();
    if (!cols.some((c) => c.name === "runtime_analyzed")) {
        db.exec("ALTER TABLE files ADD COLUMN runtime_analyzed INTEGER NOT NULL DEFAULT 0");
    }
    const auditResultCols = db
        .prepare("PRAGMA table_info(audit_results)")
        .all();
    if (!auditResultCols.some((c) => c.name === "source")) {
        db.exec("ALTER TABLE audit_results ADD COLUMN source TEXT NOT NULL DEFAULT 'llm'");
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
 *  Guideline helpers                                                  *
 * ------------------------------------------------------------------ */
function upsertGuideline(fileId, wcagId, description, status = "active") {
    getDb()
        .prepare(`INSERT INTO guidelines (file_id, wcag_id, description, status) VALUES (?, ?, ?, ?)
       ON CONFLICT(file_id, wcag_id) DO UPDATE SET description = excluded.description, status = excluded.status`)
        .run(fileId, wcagId, description, status);
}
function getIgnoredGuidelines(fileId) {
    const rows = getDb()
        .prepare("SELECT wcag_id FROM guidelines WHERE file_id = ? AND status = 'ignored'")
        .all(fileId);
    return rows.map((r) => r.wcag_id);
}
function getFileId(projectId, filePath) {
    const row = getDb()
        .prepare("SELECT id FROM files WHERE project_id = ? AND path = ?")
        .get(projectId, filePath);
    return row?.id ?? null;
}
function getActiveGuidelines(fileId) {
    return getDb()
        .prepare("SELECT wcag_id, description FROM guidelines WHERE file_id = ? AND status NOT IN ('ignored', 'na')")
        .all(fileId);
}
function getFileGuidelines(fileId) {
    return getDb()
        .prepare("SELECT wcag_id, description, status FROM guidelines WHERE file_id = ?")
        .all(fileId);
}
function updateGuidelineStatus(fileId, wcagId, status) {
    getDb()
        .prepare("UPDATE guidelines SET status = ? WHERE file_id = ? AND wcag_id = ?")
        .run(status, fileId, wcagId);
}
function getFailedGuidelines(fileId) {
    return getDb()
        .prepare("SELECT wcag_id, description FROM guidelines WHERE file_id = ? AND status = 'failed'")
        .all(fileId);
}
function clearProjectRuntimeAnalysis(projectId) {
    getDb()
        .prepare(`DELETE FROM audit_results
       WHERE source = 'runtime'
         AND file_id IN (SELECT id FROM files WHERE project_id = ?)`)
        .run(projectId);
    getDb()
        .prepare(`DELETE FROM guidelines
       WHERE file_id IN (SELECT id FROM files WHERE project_id = ?)
         AND (
           wcag_id LIKE '%1.4.3%'
           OR wcag_id LIKE '%1.4.6%'
           OR wcag_id LIKE '%1.4.11%'
         )`)
        .run(projectId);
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
    // If the result references a guideline, mark it ignored for future audits
    if (row.guideline) {
        getDb()
            .prepare(`INSERT INTO guidelines (file_id, wcag_id, description, status)
         VALUES (?, ?, 'Ignored by user', 'ignored')
         ON CONFLICT(file_id, wcag_id) DO UPDATE SET status = 'ignored'`)
            .run(row.file_id, row.guideline);
    }
}
//# sourceMappingURL=db.js.map