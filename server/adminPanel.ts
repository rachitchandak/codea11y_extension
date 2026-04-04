import type { Express, Request, Response, NextFunction } from "express";
import {
  getAllSessions,
  getSessionById,
  getLlmApiCallsBySession,
  getAllLlmProviders,
  getLlmProviderById,
  insertLlmProvider,
  updateLlmProvider,
  setActiveLlmProvider,
  deleteLlmProvider,
} from "./db";
import { PROVIDER_CATALOG, type ProviderType } from "./providers";

/* ------------------------------------------------------------------ *
 *  Basic auth middleware (dev credentials)                             *
 * ------------------------------------------------------------------ */
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin";

function basicAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Codea11y Admin"');
    res.status(401).send("Authentication required");
    return;
  }

  const credentials = Buffer.from(authHeader.slice(6), "base64").toString();
  const [user, pass] = credentials.split(":");

  if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Codea11y Admin"');
    res.status(401).send("Invalid credentials");
    return;
  }

  next();
}

/* ------------------------------------------------------------------ *
 *  HTML helpers                                                       *
 * ------------------------------------------------------------------ */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    running: "#3b82f6",
    completed: "#22c55e",
    error: "#ef4444",
  };
  const color = colors[status] || "#6b7280";
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${color};color:#fff;font-size:12px;font-weight:600;">${escapeHtml(status)}</span>`;
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Codea11y Admin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 0;
    }
    .topbar {
      background: #1e293b;
      padding: 16px 32px;
      border-bottom: 1px solid #334155;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .topbar h1 {
      font-size: 20px;
      font-weight: 700;
      color: #f8fafc;
    }
    .topbar a {
      color: #94a3b8;
      text-decoration: none;
      font-size: 14px;
    }
    .topbar a:hover { color: #e2e8f0; }
    .container { max-width: 1200px; margin: 0 auto; padding: 32px; }
    h2 { font-size: 18px; margin-bottom: 16px; color: #f8fafc; }
    .stats-row {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 16px 24px;
      flex: 1;
    }
    .stat-card .label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
    .stat-card .value { font-size: 28px; font-weight: 700; color: #f8fafc; margin-top: 4px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #1e293b;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #334155;
    }
    th {
      background: #0f172a;
      padding: 12px 16px;
      text-align: left;
      font-size: 12px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #334155;
    }
    td {
      padding: 12px 16px;
      border-bottom: 1px solid #1e293b;
      font-size: 14px;
      vertical-align: top;
    }
    tr:hover td { background: #1a2332; }
    a.btn {
      display: inline-block;
      padding: 4px 12px;
      background: #3b82f6;
      color: #fff;
      text-decoration: none;
      border-radius: 4px;
      font-size: 13px;
    }
    a.btn:hover { background: #2563eb; }
    .back-link {
      display: inline-block;
      margin-bottom: 16px;
      color: #3b82f6;
      text-decoration: none;
      font-size: 14px;
    }
    .back-link:hover { text-decoration: underline; }
    .detail-block {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .detail-block h3 {
      font-size: 14px;
      color: #94a3b8;
      margin-bottom: 8px;
    }
    .detail-block pre {
      background: #0f172a;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 400px;
      overflow-y: auto;
    }
    .meta-row {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .meta-item {
      font-size: 13px;
    }
    .meta-item .meta-label { color: #94a3b8; }
    .meta-item .meta-value { color: #f8fafc; font-weight: 600; }
    .call-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .call-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .call-number {
      font-size: 14px;
      font-weight: 700;
      color: #f8fafc;
    }
    .phase-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      background: #4338ca;
      color: #fff;
    }
    .toggle-btn {
      background: #334155;
      color: #e2e8f0;
      border: none;
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    .toggle-btn:hover { background: #475569; }
    .expandable { display: none; margin-top: 12px; }
    .expandable.open { display: block; }
    .empty-state {
      text-align: center;
      padding: 48px;
      color: #64748b;
      font-size: 16px;
    }
    .form-group { margin-bottom: 16px; }
    .form-group label {
      display: block;
      font-size: 13px;
      color: #94a3b8;
      margin-bottom: 4px;
    }
    .form-group input, .form-group select {
      width: 100%;
      padding: 8px 12px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 4px;
      color: #e2e8f0;
      font-size: 14px;
    }
    .form-group input:focus, .form-group select:focus {
      outline: none;
      border-color: #3b82f6;
    }
    .form-actions { display: flex; gap: 8px; margin-top: 20px; }
    .btn-primary {
      padding: 8px 20px;
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    .btn-primary:hover { background: #2563eb; }
    .btn-danger {
      padding: 4px 12px;
      background: #dc2626;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    .btn-danger:hover { background: #b91c1c; }
    .btn-success {
      padding: 4px 12px;
      background: #16a34a;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    .btn-success:hover { background: #15803d; }
    .btn-outline {
      padding: 4px 12px;
      background: transparent;
      color: #94a3b8;
      border: 1px solid #475569;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    .btn-outline:hover { background: #1e293b; color: #e2e8f0; }
    .active-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      background: #22c55e;
      color: #fff;
      font-size: 12px;
      font-weight: 600;
    }
    .provider-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .provider-card.is-active { border-color: #22c55e; }
    .provider-info h3 { font-size: 16px; color: #f8fafc; margin-bottom: 4px; }
    .provider-info .provider-type { font-size: 13px; color: #94a3b8; }
    .provider-actions { display: flex; gap: 8px; align-items: center; }
    .alert {
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 14px;
    }
    .alert-success { background: #14532d; color: #86efac; border: 1px solid #166534; }
    .alert-error { background: #450a0a; color: #fca5a5; border: 1px solid #7f1d1d; }
  </style>
</head>
<body>
  <div class="topbar">
    <h1>Codea11y Admin</h1>
    <a href="/admin">Sessions</a>
    <a href="/admin/providers">Providers</a>
  </div>
  <div class="container">
    ${body}
  </div>
  <script>
    function toggleExpand(id) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('open');
    }
  </script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ *
 *  Mount admin routes                                                 *
 * ------------------------------------------------------------------ */
export function mountAdminPanel(
  app: Express,
  onProviderChange: () => void
): void {
  app.use("/admin", basicAuth);

  /* ── Dashboard: list all sessions ──────────────────────────────── */
  app.get("/admin", (_req: Request, res: Response) => {
    const sessions = getAllSessions();

    const totalCalls = sessions.reduce((sum, s) => sum + s.callCount, 0);
    const totalTokens = sessions.reduce((sum, s) => sum + s.totalTokens, 0);

    let rows = "";
    if (sessions.length === 0) {
      rows = `<tr><td colspan="6" class="empty-state">No sessions yet. Run an audit to see data here.</td></tr>`;
    } else {
      for (const s of sessions) {
        rows += `<tr>
          <td>${s.id}</td>
          <td>${escapeHtml(s.query.length > 80 ? s.query.slice(0, 80) + "…" : s.query)}</td>
          <td>${statusBadge(s.status)}</td>
          <td>${s.callCount}</td>
          <td>${s.totalTokens.toLocaleString()}</td>
          <td>${formatDate(s.startedAt)}</td>
          <td><a class="btn" href="/admin/session/${s.id}">View</a></td>
        </tr>`;
      }
    }

    const body = `
      <h2>Sessions Overview</h2>
      <div class="stats-row">
        <div class="stat-card">
          <div class="label">Total Sessions</div>
          <div class="value">${sessions.length}</div>
        </div>
        <div class="stat-card">
          <div class="label">Total API Calls</div>
          <div class="value">${totalCalls}</div>
        </div>
        <div class="stat-card">
          <div class="label">Total Tokens</div>
          <div class="value">${totalTokens.toLocaleString()}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Query</th>
            <th>Status</th>
            <th>API Calls</th>
            <th>Tokens</th>
            <th>Started</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>`;

    res.send(layout("Sessions", body));
  });

  /* ── Session detail: show all API calls ────────────────────────── */
  app.get("/admin/session/:id", (req: Request, res: Response) => {
    const sessionId = Number(req.params.id);
    if (!Number.isFinite(sessionId)) {
      res.status(400).send("Invalid session id");
      return;
    }

    const session = getSessionById(sessionId);
    if (!session) {
      res.status(404).send("Session not found");
      return;
    }

    const calls = getLlmApiCallsBySession(sessionId);
    const totalTokens = calls.reduce((sum, c) => sum + (c.totalTokens || 0), 0);
    const totalDuration = calls.reduce((sum, c) => sum + (c.durationMs || 0), 0);

    let callCards = "";
    if (calls.length === 0) {
      callCards = `<div class="empty-state">No API calls recorded for this session.</div>`;
    } else {
      calls.forEach((call, idx) => {
        const expandId = `call-${call.id}`;
        callCards += `
          <div class="call-card">
            <div class="call-header">
              <div>
                <span class="call-number">#${idx + 1}</span>
                ${call.phase ? `<span class="phase-badge">${escapeHtml(call.phase)}</span>` : ""}
              </div>
              <button class="toggle-btn" onclick="toggleExpand('${expandId}')">Details</button>
            </div>
            <div class="meta-row">
              <div class="meta-item">
                <span class="meta-label">Thread: </span>
                <span class="meta-value">${escapeHtml(call.threadId || "—")}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Model: </span>
                <span class="meta-value">${escapeHtml(call.model)}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Tokens: </span>
                <span class="meta-value">${call.totalTokens?.toLocaleString() || "—"}</span>
                ${call.promptTokens != null ? `<span class="meta-label"> (${call.promptTokens} in / ${call.completionTokens} out)</span>` : ""}
              </div>
              <div class="meta-item">
                <span class="meta-label">Duration: </span>
                <span class="meta-value">${call.durationMs != null ? call.durationMs.toLocaleString() + "ms" : "—"}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">JSON mode: </span>
                <span class="meta-value">${call.isJsonMode ? "Yes" : "No"}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Time: </span>
                <span class="meta-value">${formatDate(call.createdAt)}</span>
              </div>
            </div>
            <div id="${expandId}" class="expandable">
              ${call.systemPromptPreview ? `
              <div class="detail-block">
                <h3>System Prompt (preview)</h3>
                <pre>${escapeHtml(call.systemPromptPreview)}</pre>
              </div>` : ""}
              <div class="detail-block">
                <h3>User Prompt</h3>
                <pre>${escapeHtml(call.fullUserPrompt || call.userPromptPreview || "—")}</pre>
              </div>
              <div class="detail-block">
                <h3>Response</h3>
                <pre>${escapeHtml(call.fullResponse || call.responsePreview || "—")}</pre>
              </div>
            </div>
          </div>`;
      });
    }

    const body = `
      <a class="back-link" href="/admin">&larr; Back to Sessions</a>
      <h2>Session #${session.id}</h2>
      <div class="detail-block" style="margin-bottom:24px;">
        <div class="meta-row">
          <div class="meta-item">
            <span class="meta-label">Query: </span>
            <span class="meta-value">${escapeHtml(session.query)}</span>
          </div>
        </div>
        <div class="meta-row">
          <div class="meta-item">
            <span class="meta-label">Status: </span>
            ${statusBadge(session.status)}
          </div>
          <div class="meta-item">
            <span class="meta-label">Started: </span>
            <span class="meta-value">${formatDate(session.startedAt)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Ended: </span>
            <span class="meta-value">${formatDate(session.endedAt)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Root Path: </span>
            <span class="meta-value">${escapeHtml(session.rootPath || "—")}</span>
          </div>
        </div>
        <div class="meta-row">
          <div class="meta-item">
            <span class="meta-label">Total API Calls: </span>
            <span class="meta-value">${calls.length}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Total Tokens: </span>
            <span class="meta-value">${totalTokens.toLocaleString()}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Total Duration: </span>
            <span class="meta-value">${(totalDuration / 1000).toFixed(1)}s</span>
          </div>
        </div>
      </div>
      <h2>API Calls (${calls.length})</h2>
      ${callCards}`;

    res.send(layout(`Session #${session.id}`, body));
  });

  /* ================================================================ *
   *  Provider management routes                                       *
   * ================================================================ */

  const providerTypeOptions = (Object.keys(PROVIDER_CATALOG) as ProviderType[])
    .map((pt) => PROVIDER_CATALOG[pt])
    .map((c, i) => ({ type: (Object.keys(PROVIDER_CATALOG) as ProviderType[])[i], label: c.label }));

  /* ── List providers ────────────────────────────────────────────── */
  app.get("/admin/providers", (req: Request, res: Response) => {
    const providers = getAllLlmProviders();
    const msg = typeof req.query.msg === "string" ? req.query.msg : "";
    const err = typeof req.query.err === "string" ? req.query.err : "";

    let cards = "";
    if (providers.length === 0) {
      cards = `<div class="empty-state">No providers configured yet. Add one below.</div>`;
    } else {
      for (const p of providers) {
        const catalogEntry = PROVIDER_CATALOG[p.providerType as ProviderType];
        const typeLabel = catalogEntry?.label || p.providerType;
        let config: Record<string, string> = {};
        try { config = JSON.parse(p.configJson); } catch { /* ignore */ }
        const model = config.deployment || config.model || "—";

        cards += `
          <div class="provider-card ${p.isActive ? "is-active" : ""}">
            <div class="provider-info">
              <h3>${escapeHtml(p.name)} ${p.isActive ? '<span class="active-badge">Active</span>' : ""}</h3>
              <div class="provider-type">${escapeHtml(typeLabel)} · Model: ${escapeHtml(model)}</div>
            </div>
            <div class="provider-actions">
              ${!p.isActive ? `
                <form method="POST" action="/admin/providers/${p.id}/activate" style="display:inline;">
                  <button type="submit" class="btn-success">Set Active</button>
                </form>` : ""}
              <a class="btn" href="/admin/providers/${p.id}/edit">Edit</a>
              ${!p.isActive ? `
                <form method="POST" action="/admin/providers/${p.id}/delete" style="display:inline;"
                      onsubmit="return confirm('Delete this provider?')">
                  <button type="submit" class="btn-danger">Delete</button>
                </form>` : ""}
            </div>
          </div>`;
      }
    }

    const body = `
      ${msg ? `<div class="alert alert-success">${escapeHtml(msg)}</div>` : ""}
      ${err ? `<div class="alert alert-error">${escapeHtml(err)}</div>` : ""}
      <h2>LLM Providers</h2>
      ${cards}
      <div style="margin-top:24px;">
        <a class="btn" href="/admin/providers/new">+ Add Provider</a>
      </div>`;

    res.send(layout("Providers", body));
  });

  /* ── New provider form ─────────────────────────────────────────── */
  app.get("/admin/providers/new", (_req: Request, res: Response) => {
    res.send(layout("Add Provider", providerFormHtml()));
  });

  /* ── Create provider ───────────────────────────────────────────── */
  app.post("/admin/providers", (req: Request, res: Response) => {
    try {
      const { name, providerType, setActive, ...rest } = req.body;
      if (!name || !providerType) {
        res.redirect("/admin/providers?err=Name+and+provider+type+are+required");
        return;
      }

      // Gather config fields from the request body
      const catalog = PROVIDER_CATALOG[providerType as ProviderType];
      if (!catalog) {
        res.redirect("/admin/providers?err=Unknown+provider+type");
        return;
      }

      const config: Record<string, string> = {};
      for (const field of catalog.fields) {
        const val = req.body[`config_${field.key}`];
        if (field.required && !val) {
          res.redirect(`/admin/providers/new?err=${encodeURIComponent(field.label + " is required")}`);
          return;
        }
        if (val) config[field.key] = val;
      }

      insertLlmProvider({
        name,
        providerType,
        configJson: JSON.stringify(config),
        isActive: setActive === "1",
      });

      if (setActive === "1") {
        onProviderChange();
      }

      res.redirect("/admin/providers?msg=Provider+added+successfully");
    } catch (err: any) {
      res.redirect(`/admin/providers?err=${encodeURIComponent(err.message)}`);
    }
  });

  /* ── Edit provider form ────────────────────────────────────────── */
  app.get("/admin/providers/:id/edit", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const provider = getLlmProviderById(id);
    if (!provider) {
      res.redirect("/admin/providers?err=Provider+not+found");
      return;
    }

    let config: Record<string, string> = {};
    try { config = JSON.parse(provider.configJson); } catch { /* ignore */ }

    res.send(layout("Edit Provider", providerFormHtml(provider.name, provider.providerType, config, id)));
  });

  /* ── Update provider ───────────────────────────────────────────── */
  app.post("/admin/providers/:id/update", (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { name, providerType } = req.body;

      const catalog = PROVIDER_CATALOG[providerType as ProviderType];
      if (!catalog || !name) {
        res.redirect(`/admin/providers/${id}/edit?err=Missing+required+fields`);
        return;
      }

      const config: Record<string, string> = {};
      for (const field of catalog.fields) {
        const val = req.body[`config_${field.key}`];
        if (field.required && !val) {
          res.redirect(`/admin/providers/${id}/edit?err=${encodeURIComponent(field.label + " is required")}`);
          return;
        }
        if (val) config[field.key] = val;
      }

      updateLlmProvider(id, {
        name,
        providerType,
        configJson: JSON.stringify(config),
      });

      // If this provider is active, reload it
      const provider = getLlmProviderById(id);
      if (provider?.isActive) {
        onProviderChange();
      }

      res.redirect("/admin/providers?msg=Provider+updated+successfully");
    } catch (err: any) {
      res.redirect(`/admin/providers?err=${encodeURIComponent(err.message)}`);
    }
  });

  /* ── Activate provider ─────────────────────────────────────────── */
  app.post("/admin/providers/:id/activate", (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      setActiveLlmProvider(id);
      onProviderChange();
      res.redirect("/admin/providers?msg=Provider+activated");
    } catch (err: any) {
      res.redirect(`/admin/providers?err=${encodeURIComponent(err.message)}`);
    }
  });

  /* ── Delete provider ───────────────────────────────────────────── */
  app.post("/admin/providers/:id/delete", (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const provider = getLlmProviderById(id);
      if (provider?.isActive) {
        res.redirect("/admin/providers?err=Cannot+delete+the+active+provider.+Switch+to+another+first.");
        return;
      }
      deleteLlmProvider(id);
      res.redirect("/admin/providers?msg=Provider+deleted");
    } catch (err: any) {
      res.redirect(`/admin/providers?err=${encodeURIComponent(err.message)}`);
    }
  });

  /* ── Provider form HTML helper ─────────────────────────────────── */
  function providerFormHtml(
    currentName = "",
    currentType = "",
    currentConfig: Record<string, string> = {},
    editId?: number
  ): string {
    const isEdit = editId !== undefined;
    const action = isEdit ? `/admin/providers/${editId}/update` : "/admin/providers";

    // Build the provider-type <select> options
    const typeOptions = providerTypeOptions
      .map(
        (o) =>
          `<option value="${escapeHtml(o.type)}" ${o.type === currentType ? "selected" : ""}>${escapeHtml(o.label)}</option>`
      )
      .join("");

    // Build per-provider field sets (hidden/shown by JS)
    let fieldSets = "";
    for (const [pt, catalog] of Object.entries(PROVIDER_CATALOG)) {
      const fields = catalog.fields
        .map((f) => {
          const val = pt === currentType ? (currentConfig[f.key] || "") : "";
          return `
            <div class="form-group">
              <label>${escapeHtml(f.label)}${f.required ? ' <span style="color:#ef4444;">*</span>' : ""}</label>
              <input type="${f.type === "password" ? "password" : "text"}"
                     name="config_${escapeHtml(f.key)}"
                     value="${escapeHtml(val)}"
                     placeholder="${escapeHtml(f.placeholder || "")}"
                     ${f.required ? "required" : ""}
                     autocomplete="off" />
            </div>`;
        })
        .join("");
      fieldSets += `<div class="provider-fields" data-provider="${escapeHtml(pt)}" style="display:${pt === currentType || (!currentType && pt === "azure-openai") ? "block" : "none"}">${fields}</div>`;
    }

    return `
      <a class="back-link" href="/admin/providers">&larr; Back to Providers</a>
      <h2>${isEdit ? "Edit Provider" : "Add New Provider"}</h2>
      <div class="detail-block" style="max-width:600px;">
        <form method="POST" action="${action}">
          <div class="form-group">
            <label>Provider Name <span style="color:#ef4444;">*</span></label>
            <input type="text" name="name" value="${escapeHtml(currentName)}" placeholder="My Azure OpenAI" required />
          </div>
          <div class="form-group">
            <label>Provider Type <span style="color:#ef4444;">*</span></label>
            <select name="providerType" id="providerTypeSelect" ${isEdit ? "" : ""}>
              <option value="">— Select —</option>
              ${typeOptions}
            </select>
          </div>
          <div id="providerFieldsContainer">
            ${fieldSets}
          </div>
          ${!isEdit ? `
          <div class="form-group">
            <label>
              <input type="checkbox" name="setActive" value="1" style="width:auto;margin-right:6px;" />
              Set as active provider
            </label>
          </div>` : ""}
          <div class="form-actions">
            <button type="submit" class="btn-primary">${isEdit ? "Save Changes" : "Add Provider"}</button>
            <a href="/admin/providers" class="btn-outline">Cancel</a>
          </div>
        </form>
      </div>
      <script>
        document.getElementById('providerTypeSelect').addEventListener('change', function() {
          const selected = this.value;
          document.querySelectorAll('.provider-fields').forEach(function(el) {
            el.style.display = el.getAttribute('data-provider') === selected ? 'block' : 'none';
            // Clear inputs for hidden providers
            if (el.getAttribute('data-provider') !== selected) {
              el.querySelectorAll('input').forEach(function(input) { input.value = ''; });
            }
          });
        });
      </script>`;
  }
}
