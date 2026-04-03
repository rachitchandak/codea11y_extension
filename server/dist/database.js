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
exports.getDatabase = getDatabase;
exports.saveDatabase = saveDatabase;
exports.setupAutoSave = setupAutoSave;
const sql_js_1 = __importDefault(require("sql.js"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("./config");
const DB_PATH = path.join(__dirname, '..', 'data', 'database.sqlite');
const LEGACY_AUDIT_DB_PATH = process.env.LEGACY_AUDIT_DB_PATH || path.join(__dirname, '..', '..', 'codea11y.db');
let db = null;
async function initDatabase() {
    const SQL = await (0, sql_js_1.default)();
    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    // Wipe existing database on startup (Limit to dev/testing or based on flag if needed, but per request, doing it always for now)
    // To be safe and follow the request "remove previous database so i dont run insto issues", we remove it before loading.
    /*
    DISABLED FOR PERSISTENCE
    if (fs.existsSync(DB_PATH)) {
        try {
            fs.unlinkSync(DB_PATH);
            console.log('Existing database removed.');
        } catch (err) {
            console.error('Failed to remove existing database:', err);
        }
    }
    */
    // Load existing database or create new one
    // Since we just deleted it, we will always create a new one here.
    // Keeping the check just in case the delete failed or logic changes later.
    const hasUnifiedDatabase = fs.existsSync(DB_PATH);
    const hasLegacyAuditDatabase = fs.existsSync(LEGACY_AUDIT_DB_PATH);
    if (hasUnifiedDatabase) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
        createTables(db);
    }
    else if (hasLegacyAuditDatabase) {
        const fileBuffer = fs.readFileSync(LEGACY_AUDIT_DB_PATH);
        db = new SQL.Database(fileBuffer);
        createTables(db);
        ensureDefaultAdmin(db);
        saveDatabase();
        console.log(`Unified database initialized from legacy audit database at ${LEGACY_AUDIT_DB_PATH}`);
    }
    else {
        db = new SQL.Database();
        createTables(db);
        ensureDefaultAdmin(db);
        saveDatabase();
    }
    return db;
}
function createTables(db) {
    createAuditTables(db);
    createAuthTables(db);
}
function createAuditTables(db) {
    db.run(`
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL UNIQUE
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            path TEXT NOT NULL,
            file_hash TEXT,
            scan_status TEXT NOT NULL DEFAULT 'pending',
            runtime_analyzed INTEGER NOT NULL DEFAULT 0,
            accessibility_score REAL,
            UNIQUE(project_id, path),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS guidelines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            wcag_id TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            UNIQUE(file_id, wcag_id),
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS applicable_guidelines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            wcag_id TEXT NOT NULL,
            description TEXT NOT NULL,
            UNIQUE(file_id, wcag_id),
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS ignored_guidelines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            wcag_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(file_id, wcag_id),
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS schema_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS audit_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            issue_description TEXT NOT NULL,
            guideline TEXT,
            severity TEXT DEFAULT 'warning',
            line_number INTEGER,
            selector TEXT,
            snippet TEXT,
            suggestion TEXT,
            ignored INTEGER DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'llm',
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            file_path TEXT NOT NULL,
            file_hash TEXT NOT NULL,
            overall_accessibility_score REAL NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            payload_json TEXT NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
    `);
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_reports_file_path_created_at
        ON reports(file_path, created_at DESC, id DESC)
    `);
    ensureColumn(db, 'files', 'runtime_analyzed', "ALTER TABLE files ADD COLUMN runtime_analyzed INTEGER NOT NULL DEFAULT 0");
    ensureColumn(db, 'files', 'file_hash', 'ALTER TABLE files ADD COLUMN file_hash TEXT');
    ensureColumn(db, 'audit_results', 'source', "ALTER TABLE audit_results ADD COLUMN source TEXT NOT NULL DEFAULT 'llm'");
    const splitMigration = db.exec(`SELECT value FROM schema_meta WHERE key = 'guideline_split_v1'`);
    if (splitMigration.length === 0 || splitMigration[0].values.length === 0) {
        db.run(`
            INSERT OR IGNORE INTO ignored_guidelines (file_id, wcag_id)
            SELECT file_id, wcag_id
            FROM guidelines
            WHERE status = 'ignored'
        `);
        db.run(`DELETE FROM applicable_guidelines`);
        db.run(`UPDATE files SET runtime_analyzed = 0`);
        db.run(`
            INSERT OR REPLACE INTO schema_meta (key, value)
            VALUES ('guideline_split_v1', 'done')
        `);
    }
}
function createAuthTables(db) {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_approved INTEGER DEFAULT 0,
            is_admin INTEGER DEFAULT 0,
            force_password_change INTEGER DEFAULT 0,
            security_question TEXT,
            security_answer_hash TEXT,
            failed_attempts INTEGER DEFAULT 0,
            lockout_until TEXT,
            lockout_count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    // Add lockout columns if they don't exist
    try {
        db.run(`ALTER TABLE users ADD COLUMN failed_attempts INTEGER DEFAULT 0`);
    }
    catch (e) { }
    try {
        db.run(`ALTER TABLE users ADD COLUMN lockout_until TEXT`);
    }
    catch (e) { }
    try {
        db.run(`ALTER TABLE users ADD COLUMN lockout_count INTEGER DEFAULT 0`);
    }
    catch (e) { }
    db.run(`
        CREATE TABLE IF NOT EXISTS password_reset_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending', -- pending, approved, rejected
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS api_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            azure_api_key TEXT,
            azure_resource_name TEXT,
            azure_deployment_name TEXT,
            worker_deployment_name TEXT,
            api_version TEXT DEFAULT '2025-01-01-preview',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS vsix_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
            uploaded_by INTEGER,
            FOREIGN KEY (uploaded_by) REFERENCES users(id)
        )
    `);
    // LLM session logging tables
    db.run(`
        CREATE TABLE IF NOT EXISTS llm_sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            started_at TEXT DEFAULT CURRENT_TIMESTAMP,
            ended_at TEXT,
            status TEXT DEFAULT 'active',
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS llm_calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
            agent_type TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            request_json TEXT,
            response_json TEXT,
            duration_ms INTEGER,
            tokens_used INTEGER DEFAULT 0,
            FOREIGN KEY (session_id) REFERENCES llm_sessions(id)
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            category TEXT NOT NULL, -- 'ADMIN' or 'OPERATOR'
            details TEXT,           -- JSON string
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
}
function ensureColumn(db, tableName, columnName, alterSql) {
    const tableInfo = db.exec(`PRAGMA table_info(${tableName})`);
    const columns = tableInfo[0]?.values ?? [];
    const hasColumn = columns.some((column) => column[1] === columnName);
    if (!hasColumn) {
        db.run(alterSql);
    }
}
function ensureDefaultAdmin(db) {
    const existingAdmin = db.exec(`SELECT id FROM users WHERE is_admin = 1 LIMIT 1`);
    if (existingAdmin.length > 0 && existingAdmin[0].values.length > 0) {
        return;
    }
    createDefaultAdmin(db);
}
function createDefaultAdmin(db) {
    const bcrypt = require('bcryptjs');
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@codea11y.com';
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || (!config_1.isProduction ? 'admin123' : '');
    if (!adminPassword) {
        console.warn('Initial admin user was not created because DEFAULT_ADMIN_PASSWORD is not set.');
        return;
    }
    const passwordHash = bcrypt.hashSync(adminPassword, 10);
    db.run(`INSERT INTO users (email, password_hash, is_approved, is_admin, force_password_change) VALUES (?, ?, 1, 1, 1)`, [adminEmail, passwordHash]);
    console.log(`Initial admin created: ${adminEmail} (password change required on first login)`);
}
function getDatabase() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}
function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}
// Save database periodically and on exit
function setupAutoSave() {
    // Save every 30 seconds
    setInterval(() => saveDatabase(), 30000);
    // Save on exit
    process.on('exit', () => saveDatabase());
    process.on('SIGINT', () => {
        saveDatabase();
        process.exit();
    });
    process.on('SIGTERM', () => {
        saveDatabase();
        process.exit();
    });
}
//# sourceMappingURL=database.js.map