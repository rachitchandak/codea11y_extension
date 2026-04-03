import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { getDatabase } from '../database';
import { AuthRequest, authenticate, requireApproved } from '../middleware/auth';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// Get own API config (for the binary to fetch)
router.get('/config', requireApproved, (req: AuthRequest, res: Response) => {
    const db = getDatabase();
    const result = db.exec(`
        SELECT azure_api_key, azure_resource_name, azure_deployment_name, 
               worker_deployment_name, api_version
        FROM api_configs WHERE user_id = ?
    `, [req.user?.id]);

    if (result.length === 0 || result[0].values.length === 0) {
        res.status(404).json({ error: 'No API configuration found. Please contact admin.' });
        return;
    }

    const row = result[0].values[0];
    res.json({
        azure_api_key: row[0],
        azure_resource_name: row[1],
        azure_deployment_name: row[2],
        worker_deployment_name: row[3],
        api_version: row[4]
    });
});

// Download latest VSIX
router.get('/vsix', (req: AuthRequest, res: Response) => {
    const db = getDatabase();
    const result = db.exec(`
        SELECT filename, filepath FROM vsix_files 
        ORDER BY uploaded_at DESC LIMIT 1
    `);

    if (result.length === 0 || result[0].values.length === 0) {
        res.status(404).json({ error: 'No VSIX file available' });
        return;
    }

    const filename = result[0].values[0][0] as string;
    const filepath = result[0].values[0][1] as string;

    if (!fs.existsSync(filepath)) {
        res.status(404).json({ error: 'VSIX file not found on server' });
        return;
    }

    res.download(filepath, filename);
});

// Get VSIX metadata (for UI status)
router.get('/vsix/metadata', (req: AuthRequest, res: Response) => {
    const db = getDatabase();
    const result = db.exec(`
        SELECT filename, filepath, uploaded_at FROM vsix_files 
        ORDER BY uploaded_at DESC LIMIT 1
    `);

    if (result.length === 0 || result[0].values.length === 0) {
        res.json({ available: false });
        return;
    }

    const row = result[0].values[0];
    const filename = row[0] as string;
    const filepath = row[1] as string;
    const uploadedAt = row[2] as string;

    if (!fs.existsSync(filepath)) {
        res.json({ available: false });
        // Optional: Clean up ghost record here if desired, but admin delete fixes this now.
        return;
    }

    res.json({
        available: true,
        filename: filename,
        uploaded_at: uploadedAt
    });
});

// Get user's own info
router.get('/me', (req: AuthRequest, res: Response) => {
    res.json({ user: req.user });
});

export default router;
