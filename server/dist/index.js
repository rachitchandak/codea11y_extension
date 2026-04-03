"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const database_1 = require("./database");
const config_1 = require("./config");
const auth_1 = __importDefault(require("./routes/auth"));
const admin_1 = __importDefault(require("./routes/admin"));
const user_1 = __importDefault(require("./routes/user"));
const llm_1 = __importDefault(require("./routes/llm"));
const logs_1 = __importDefault(require("./routes/logs"));
const audit_1 = __importDefault(require("./routes/audit"));
async function main() {
    (0, config_1.assertProductionConfig)();
    // Initialize database
    await (0, database_1.initDatabase)();
    (0, database_1.setupAutoSave)();
    console.log('Database initialized');
    const app = (0, express_1.default)();
    const publicDir = path_1.default.join(__dirname, '..', 'public');
    if (config_1.isProduction) {
        app.set('trust proxy', 1);
    }
    // Middleware
    app.use((0, cors_1.default)({
        origin(origin, callback) {
            if (!origin) {
                callback(null, true);
                return;
            }
            if (!config_1.isProduction || config_1.ALLOWED_ORIGINS.length === 0 || config_1.ALLOWED_ORIGINS.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error('Origin not allowed by CORS'));
        }
    }));
    app.use(express_1.default.json({ limit: '10mb' })); // Increased for LLM payloads
    app.get('/', (_req, res) => {
        res.redirect((0, config_1.buildBasePath)('/'));
    });
    if (config_1.APP_BASE_PATH) {
        app.get(new RegExp(`^${config_1.APP_BASE_PATH}$`), (_req, res) => {
            res.redirect((0, config_1.buildBasePath)('/'));
        });
        app.get((0, config_1.buildBasePath)('/'), (_req, res) => {
            res.sendFile(path_1.default.join(publicDir, 'index.html'));
        });
    }
    // Serve static files
    app.use(config_1.APP_BASE_PATH || '/', express_1.default.static(publicDir));
    // API routes
    app.use((0, config_1.buildBasePath)('/api/auth'), auth_1.default);
    app.use((0, config_1.buildBasePath)('/api/admin'), admin_1.default);
    app.use((0, config_1.buildBasePath)('/api/user'), user_1.default);
    app.use((0, config_1.buildBasePath)('/api/llm'), llm_1.default);
    app.use((0, config_1.buildBasePath)('/api/logs'), logs_1.default);
    app.use((0, config_1.buildBasePath)('/api/audit'), audit_1.default);
    // Health check
    app.get((0, config_1.buildBasePath)('/api/health'), (_req, res) => {
        res.json({ status: 'ok' });
    });
    // VS Code Extension Login Page
    app.get((0, config_1.buildBasePath)('/vscode-login'), (_req, res) => {
        res.sendFile(path_1.default.join(publicDir, 'vscode-login.html'));
    });
    // Start server
    app.listen(config_1.PORT, config_1.HOST, () => {
        console.log(`
╔═══════════════════════════════════════════════════════════╗
║           CodeA11y Auth + LLM Proxy Server                ║
╚═══════════════════════════════════════════════════════════╝

Server running on ${config_1.PUBLIC_APP_URL}
Environment: ${config_1.isProduction ? 'production' : 'development'}
Base path: ${config_1.APP_BASE_PATH || '/'}

Auth Endpoints:
  - POST ${(0, config_1.buildBasePath)('/api/auth/register')}     - Register new user
  - POST ${(0, config_1.buildBasePath)('/api/auth/login')}        - Login
  - GET  ${(0, config_1.buildBasePath)('/api/auth/me')}           - Get current user

Admin Endpoints:
  - GET  ${(0, config_1.buildBasePath)('/api/admin/users')}       - List users
  - POST ${(0, config_1.buildBasePath)('/api/admin/users/:id/approve')}  - Approve user
  - PUT  ${(0, config_1.buildBasePath)('/api/admin/users/:id/config')}   - Set API config

LLM Proxy Endpoints:
  - POST ${(0, config_1.buildBasePath)('/api/llm/chat')}              - Chat Completions (worker/intent)
  - POST ${(0, config_1.buildBasePath)('/api/llm/assistants/create')} - Create Assistant
  - POST ${(0, config_1.buildBasePath)('/api/llm/assistants/chat')}   - Combined chat (message+run+poll)
  - POST ${(0, config_1.buildBasePath)('/api/llm/threads/:id/runs/stream')} - Stream run (SSE)

Audit Endpoints:
  - POST ${(0, config_1.buildBasePath)('/api/audit/reports/open')}             - Open or generate a report
  - GET  ${(0, config_1.buildBasePath)('/api/audit/reports/:id')}              - Get stored report by id
  - POST ${(0, config_1.buildBasePath)('/api/audit/reports/project-snapshot')} - Get project snapshot
  - POST ${(0, config_1.buildBasePath)('/api/audit/agent/start')}              - Stream audit workflow
  - POST ${(0, config_1.buildBasePath)('/api/audit/ignore-issue')}             - Ignore audit issue

Logging Endpoints:
  - GET  ${(0, config_1.buildBasePath)('/api/logs/sessions')}         - List LLM sessions
  - GET  ${(0, config_1.buildBasePath)('/api/logs/sessions/:id')}     - Get session details
        `);
    });
}
main().catch(console.error);
//# sourceMappingURL=index.js.map