"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stream_1 = require("stream");
const config_1 = require("../config");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate, auth_1.requireApproved);
function buildLegacyUrl(pathname) {
    return new URL(pathname, `${config_1.LEGACY_AUDIT_SERVER_URL.replace(/\/+$/, '')}/`).toString();
}
function buildForwardHeaders(req) {
    const headers = {
        'Content-Type': 'application/json',
        'X-Codea11y-User-Id': String(req.user?.id || ''),
        'X-Codea11y-User-Email': req.user?.email || ''
    };
    return headers;
}
async function relayJsonResponse(upstream, res) {
    const raw = await upstream.text();
    const contentType = upstream.headers.get('content-type') || 'application/json';
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.send(raw);
}
router.get('/health', async (_req, res) => {
    try {
        const upstream = await fetch(buildLegacyUrl('/health'));
        await relayJsonResponse(upstream, res);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(502).json({ error: `Legacy audit server unavailable: ${message}` });
    }
});
router.post('/reports/open', async (req, res) => {
    try {
        const upstream = await fetch(buildLegacyUrl('/reports/open'), {
            method: 'POST',
            headers: buildForwardHeaders(req),
            body: JSON.stringify(req.body)
        });
        await relayJsonResponse(upstream, res);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(502).json({ error: `Failed to reach legacy report service: ${message}` });
    }
});
router.get('/reports/:id', async (req, res) => {
    try {
        const upstream = await fetch(buildLegacyUrl(`/reports/${encodeURIComponent(req.params.id)}`), {
            headers: buildForwardHeaders(req)
        });
        await relayJsonResponse(upstream, res);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(502).json({ error: `Failed to reach legacy report service: ${message}` });
    }
});
router.post('/reports/project-snapshot', async (req, res) => {
    try {
        const upstream = await fetch(buildLegacyUrl('/reports/project-snapshot'), {
            method: 'POST',
            headers: buildForwardHeaders(req),
            body: JSON.stringify(req.body)
        });
        await relayJsonResponse(upstream, res);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(502).json({ error: `Failed to reach legacy project snapshot service: ${message}` });
    }
});
router.post('/ignore-issue', async (req, res) => {
    try {
        const upstream = await fetch(buildLegacyUrl('/ignore-issue'), {
            method: 'POST',
            headers: buildForwardHeaders(req),
            body: JSON.stringify(req.body)
        });
        await relayJsonResponse(upstream, res);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(502).json({ error: `Failed to reach legacy issue service: ${message}` });
    }
});
router.post('/agent/start', async (req, res) => {
    try {
        const upstream = await fetch(buildLegacyUrl('/agent/start'), {
            method: 'POST',
            headers: buildForwardHeaders(req),
            body: JSON.stringify(req.body)
        });
        if (!upstream.ok || !upstream.body) {
            await relayJsonResponse(upstream, res);
            return;
        }
        res.status(upstream.status);
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/x-ndjson');
        res.setHeader('Cache-Control', upstream.headers.get('cache-control') || 'no-cache');
        res.setHeader('Connection', upstream.headers.get('connection') || 'keep-alive');
        res.setHeader('X-Content-Type-Options', upstream.headers.get('x-content-type-options') || 'nosniff');
        for await (const chunk of stream_1.Readable.fromWeb(upstream.body)) {
            res.write(chunk);
        }
        res.end();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!res.headersSent) {
            res.status(502).json({ error: `Failed to reach legacy audit agent: ${message}` });
            return;
        }
        res.end();
    }
});
exports.default = router;
//# sourceMappingURL=audit.js.map