import { Router, Response } from 'express';
import { Readable } from 'stream';
import { LEGACY_AUDIT_SERVER_URL } from '../config';
import { authenticate, AuthRequest, requireApproved } from '../middleware/auth';

const router = Router();

router.use(authenticate, requireApproved);

function buildLegacyUrl(pathname: string): string {
    return new URL(pathname, `${LEGACY_AUDIT_SERVER_URL.replace(/\/+$/, '')}/`).toString();
}

function buildForwardHeaders(req: AuthRequest): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Codea11y-User-Id': String(req.user?.id || ''),
        'X-Codea11y-User-Email': req.user?.email || ''
    };

    return headers;
}

async function relayJsonResponse(upstream: globalThis.Response, res: Response): Promise<void> {
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
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(502).json({ error: `Legacy audit server unavailable: ${message}` });
    }
});

router.post('/reports/open', async (req: AuthRequest, res: Response) => {
    try {
        const upstream = await fetch(buildLegacyUrl('/reports/open'), {
            method: 'POST',
            headers: buildForwardHeaders(req),
            body: JSON.stringify(req.body)
        });

        await relayJsonResponse(upstream, res);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(502).json({ error: `Failed to reach legacy report service: ${message}` });
    }
});

router.get('/reports/:id', async (req: AuthRequest, res: Response) => {
    try {
        const upstream = await fetch(buildLegacyUrl(`/reports/${encodeURIComponent(req.params.id)}`), {
            headers: buildForwardHeaders(req)
        });

        await relayJsonResponse(upstream, res);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(502).json({ error: `Failed to reach legacy report service: ${message}` });
    }
});

router.post('/reports/project-snapshot', async (req: AuthRequest, res: Response) => {
    try {
        const upstream = await fetch(buildLegacyUrl('/reports/project-snapshot'), {
            method: 'POST',
            headers: buildForwardHeaders(req),
            body: JSON.stringify(req.body)
        });

        await relayJsonResponse(upstream, res);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(502).json({ error: `Failed to reach legacy project snapshot service: ${message}` });
    }
});

router.post('/ignore-issue', async (req: AuthRequest, res: Response) => {
    try {
        const upstream = await fetch(buildLegacyUrl('/ignore-issue'), {
            method: 'POST',
            headers: buildForwardHeaders(req),
            body: JSON.stringify(req.body)
        });

        await relayJsonResponse(upstream, res);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(502).json({ error: `Failed to reach legacy issue service: ${message}` });
    }
});

router.post('/agent/start', async (req: AuthRequest, res: Response) => {
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

        for await (const chunk of Readable.fromWeb(upstream.body as never)) {
            res.write(chunk);
        }

        res.end();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!res.headersSent) {
            res.status(502).json({ error: `Failed to reach legacy audit agent: ${message}` });
            return;
        }

        res.end();
    }
});

export default router;