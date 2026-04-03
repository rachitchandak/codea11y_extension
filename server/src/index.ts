import express from 'express';
import cors from 'cors';
import path from 'path';
import { initDatabase, setupAutoSave } from './database';
import { ALLOWED_ORIGINS, APP_BASE_PATH, assertProductionConfig, buildBasePath, HOST, isProduction, PORT, PUBLIC_APP_URL } from './config';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import userRoutes from './routes/user';
import llmRoutes from './routes/llm';
import logsRoutes from './routes/logs';
import auditRoutes from './routes/audit';

async function main() {
  assertProductionConfig();

  // Initialize database
  await initDatabase();
  setupAutoSave();
  console.log('Database initialized');

  const app = express();
  const publicDir = path.join(__dirname, '..', 'public');

  if (isProduction) {
    app.set('trust proxy', 1);
  }

  // Middleware
  app.use(cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (!isProduction || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'));
    }
  }));
  app.use(express.json({ limit: '10mb' })); // Increased for LLM payloads

  app.get('/', (_req, res) => {
    res.redirect(buildBasePath('/'));
  });

  if (APP_BASE_PATH) {
    app.get(new RegExp(`^${APP_BASE_PATH}$`), (_req, res) => {
      res.redirect(buildBasePath('/'));
    });

    app.get(buildBasePath('/'), (_req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

  // Serve static files
  app.use(APP_BASE_PATH || '/', express.static(publicDir));

  // API routes
  app.use(buildBasePath('/api/auth'), authRoutes);
  app.use(buildBasePath('/api/admin'), adminRoutes);
  app.use(buildBasePath('/api/user'), userRoutes);
  app.use(buildBasePath('/api/llm'), llmRoutes);
  app.use(buildBasePath('/api/logs'), logsRoutes);
  app.use(buildBasePath('/api/audit'), auditRoutes);

  // Health check
  app.get(buildBasePath('/api/health'), (_req, res) => {
    res.json({ status: 'ok' });
  });

  // VS Code Extension Login Page
  app.get(buildBasePath('/vscode-login'), (_req, res) => {
    res.sendFile(path.join(publicDir, 'vscode-login.html'));
  });

  // Start server
  app.listen(PORT, HOST, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           CodeA11y Auth + LLM Proxy Server                ║
╚═══════════════════════════════════════════════════════════╝

Server running on ${PUBLIC_APP_URL}
Environment: ${isProduction ? 'production' : 'development'}
Base path: ${APP_BASE_PATH || '/'}

Auth Endpoints:
  - POST ${buildBasePath('/api/auth/register')}     - Register new user
  - POST ${buildBasePath('/api/auth/login')}        - Login
  - GET  ${buildBasePath('/api/auth/me')}           - Get current user

Admin Endpoints:
  - GET  ${buildBasePath('/api/admin/users')}       - List users
  - POST ${buildBasePath('/api/admin/users/:id/approve')}  - Approve user
  - PUT  ${buildBasePath('/api/admin/users/:id/config')}   - Set API config

LLM Proxy Endpoints:
  - POST ${buildBasePath('/api/llm/chat')}              - Chat Completions (worker/intent)
  - POST ${buildBasePath('/api/llm/assistants/create')} - Create Assistant
  - POST ${buildBasePath('/api/llm/assistants/chat')}   - Combined chat (message+run+poll)
  - POST ${buildBasePath('/api/llm/threads/:id/runs/stream')} - Stream run (SSE)

Audit Endpoints:
  - POST ${buildBasePath('/api/audit/reports/open')}             - Open or generate a report
  - GET  ${buildBasePath('/api/audit/reports/:id')}              - Get stored report by id
  - POST ${buildBasePath('/api/audit/reports/project-snapshot')} - Get project snapshot
  - POST ${buildBasePath('/api/audit/agent/start')}              - Stream audit workflow
  - POST ${buildBasePath('/api/audit/ignore-issue')}             - Ignore audit issue

Logging Endpoints:
  - GET  ${buildBasePath('/api/logs/sessions')}         - List LLM sessions
  - GET  ${buildBasePath('/api/logs/sessions/:id')}     - Get session details
        `);
  });
}

main().catch(console.error);

