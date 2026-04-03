import { Router, Response } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { getDatabase, saveDatabase } from '../database';
import { AuthRequest, authenticate, requireAdmin } from '../middleware/auth';
import { logAudit } from '../utils/audit';

const router = Router();

// Configure multer for VSIX uploads
const uploadDir = path.join(__dirname, '..', '..', 'data', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        cb(null, `${timestamp}-${file.originalname}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB max file size
    },
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() === '.vsix') {
            cb(null, true);
        } else {
            cb(new Error('Only .vsix files are allowed'));
        }
    }
});

// All admin routes require authentication and admin role
router.use(authenticate, requireAdmin);

// List all users
router.get('/users', (req: AuthRequest, res: Response) => {
    const db = getDatabase();
    const result = db.exec(`
        SELECT u.id, u.email, u.is_approved, u.is_admin, u.created_at,
               c.azure_api_key, c.azure_resource_name, c.azure_deployment_name, 
               c.worker_deployment_name, c.api_version
        FROM users u
        LEFT JOIN api_configs c ON u.id = c.user_id
        ORDER BY u.created_at DESC
    `);

    if (result.length === 0) {
        res.json({ users: [] });
        return;
    }

    const users = result[0].values.map(row => ({
        id: row[0],
        email: row[1],
        is_approved: row[2] === 1,
        is_admin: row[3] === 1,
        created_at: row[4],
        config: row[5] ? {
            azure_api_key: row[5] ? '••••••••' : null, // Hide actual key
            azure_resource_name: row[6],
            azure_deployment_name: row[7],
            worker_deployment_name: row[8],
            api_version: row[9]
        } : null
    }));

    res.json({ users });
});

// Approve user
router.post('/users/:id/approve', (req: AuthRequest, res: Response) => {
    const userId = parseInt(req.params.id);
    const db = getDatabase();

    db.run(`UPDATE users SET is_approved = 1 WHERE id = ?`, [userId]);

    logAudit(req.user?.id as number, 'APPROVE_USER', 'ADMIN', { targetUserId: userId });

    saveDatabase();

    res.json({ message: 'User approved' });
});

// Reject (delete) user
router.post('/users/:id/reject', (req: AuthRequest, res: Response) => {
    const userId = parseInt(req.params.id);
    const db = getDatabase();

    // Don't allow deleting yourself
    if (userId === req.user?.id) {
        res.status(400).json({ error: 'Cannot delete your own account' });
        return;
    }

    db.run(`DELETE FROM api_configs WHERE user_id = ?`, [userId]);
    db.run(`DELETE FROM users WHERE id = ?`, [userId]);

    logAudit(req.user?.id as number, 'DELETE_USER', 'ADMIN', { targetUserId: userId });

    saveDatabase();

    res.json({ message: 'User deleted' });
});

// Set user API config
router.put('/users/:id/config', (req: AuthRequest, res: Response) => {
    const userId = parseInt(req.params.id);
    const {
        azure_api_key,
        azure_resource_name,
        azure_deployment_name,
        worker_deployment_name,
        api_version
    } = req.body;

    const db = getDatabase();

    // Check if config exists
    const existing = db.exec(`SELECT id FROM api_configs WHERE user_id = ?`, [userId]);

    if (existing.length > 0 && existing[0].values.length > 0) {
        // Update existing
        db.run(`
            UPDATE api_configs SET 
                azure_api_key = ?,
                azure_resource_name = ?,
                azure_deployment_name = ?,
                worker_deployment_name = ?,
                api_version = ?
            WHERE user_id = ?
        `, [azure_api_key, azure_resource_name, azure_deployment_name, worker_deployment_name, api_version || '2025-01-01-preview', userId]);
    } else {
        // Insert new
        db.run(`
            INSERT INTO api_configs (user_id, azure_api_key, azure_resource_name, azure_deployment_name, worker_deployment_name, api_version)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [userId, azure_api_key, azure_resource_name, azure_deployment_name, worker_deployment_name, api_version || '2025-01-01-preview']);
    }

    saveDatabase();

    logAudit(req.user?.id as number, 'UPDATE_CONFIG', 'ADMIN', { targetUserId: userId });

    res.json({ message: 'Config updated' });
});

// Upload VSIX
router.post('/vsix/upload', upload.single('vsix'), (req: AuthRequest, res: Response) => {
    if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
    }

    const db = getDatabase();
    db.run(`
        INSERT INTO vsix_files (filename, filepath, uploaded_by)
        VALUES (?, ?, ?)
    `, [req.file.originalname, req.file.path, req.user?.id]);

    logAudit(req.user?.id as number, 'UPLOAD_VSIX', 'ADMIN', { filename: req.file.originalname });

    saveDatabase();

    res.json({ message: 'VSIX uploaded successfully', filename: req.file.originalname });
});

// List VSIX files
router.get('/vsix', (req: AuthRequest, res: Response) => {
    const db = getDatabase();
    const result = db.exec(`
        SELECT v.id, v.filename, v.uploaded_at, u.email as uploaded_by
        FROM vsix_files v
        LEFT JOIN users u ON v.uploaded_by = u.id
        ORDER BY v.uploaded_at DESC
    `);

    if (result.length === 0) {
        res.json({ files: [] });
        return;
    }

    const files = result[0].values.map(row => ({
        id: row[0],
        filename: row[1],
        uploaded_at: row[2],
        uploaded_by: row[3]
    }));

    res.json({ files });
});

// Delete VSIX
router.delete('/vsix/:id', (req: AuthRequest, res: Response) => {
    const fileId = parseInt(req.params.id);
    const db = getDatabase();

    // Get file path first
    const result = db.exec(`SELECT filepath FROM vsix_files WHERE id = ?`, [fileId]);
    if (result.length > 0 && result[0].values.length > 0) {
        const filepath = result[0].values[0][0] as string;
        if (fs.existsSync(filepath)) {
            try {
                fs.unlinkSync(filepath);
            } catch (err) {
                console.error('Failed to delete VSIX file:', err);
            }
        }

        // Remove from database even if file missing (cleanup ghost records)
        db.run(`DELETE FROM vsix_files WHERE id = ?`, [fileId]);

        logAudit(req.user?.id as number, 'DELETE_VSIX', 'ADMIN', { vsixId: fileId });
    }

    res.json({ message: 'VSIX deleted' });
});

// List Password Reset Requests
router.get('/reset-requests', (req: AuthRequest, res: Response) => {
    const db = getDatabase();
    const result = db.exec(`
        SELECT r.id, r.user_id, r.created_at, u.email
        FROM password_reset_requests r
        JOIN users u ON r.user_id = u.id
        WHERE r.status = 'pending'
        ORDER BY r.created_at DESC
    `);

    if (result.length === 0) {
        res.json({ requests: [] });
        return;
    }

    const requests = result[0].values.map(row => ({
        id: row[0],
        user_id: row[1],
        created_at: row[2],
        email: row[3]
    }));

    res.json({ requests });
});

// Approve Password Reset Request
router.post('/reset-requests/:id/approve', async (req: AuthRequest, res: Response) => {
    try {
        const requestId = parseInt(req.params.id);
        const db = getDatabase();

        // Get user_id from request
        const requestResult = db.exec(`SELECT user_id FROM password_reset_requests WHERE id = ?`, [requestId]);
        if (requestResult.length === 0 || requestResult[0].values.length === 0) {
            res.status(404).json({ error: 'Request not found' });
            return;
        }
        const userId = requestResult[0].values[0][0] as number;

        // Get user email to set as password
        const userResult = db.exec(`SELECT email FROM users WHERE id = ?`, [userId]);
        if (userResult.length === 0 || userResult[0].values.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const email = userResult[0].values[0][0] as string;

        // Reset password to email address and force change, and clear lockout counters
        const passwordHash = await bcrypt.hash(email, 10);

        db.run(`UPDATE users SET password_hash = ?, force_password_change = 1, failed_attempts = 0, lockout_until = NULL, lockout_count = 0 WHERE id = ?`, [passwordHash, userId]);
        db.run(`UPDATE password_reset_requests SET status = 'approved' WHERE id = ?`, [requestId]);

        logAudit(req.user?.id as number, 'APPROVE_RESET', 'ADMIN', { targetUserId: userId, requestId });

        saveDatabase();

        res.json({ message: 'Password reset to user email address' });
    } catch (error) {
        console.error('Approve reset error:', error);
        res.status(500).json({ error: 'Failed to approve reset' });
    }
});

// Reject Password Reset Request
router.post('/reset-requests/:id/reject', (req: AuthRequest, res: Response) => {
    const requestId = parseInt(req.params.id);
    const db = getDatabase();

    db.run(`UPDATE password_reset_requests SET status = 'rejected' WHERE id = ?`, [requestId]);

    logAudit(req.user?.id as number, 'REJECT_RESET', 'ADMIN', { requestId });

    saveDatabase();

    res.json({ message: 'Request rejected' });
});

// Get Audit Logs
router.get('/audit-logs', (req: AuthRequest, res: Response) => {
    const { category } = req.query;
    const db = getDatabase();

    let query = `
        SELECT l.id, l.action, l.category, l.details, l.timestamp, u.email
        FROM audit_logs l
        JOIN users u ON l.user_id = u.id
    `;

    const params: any[] = [];
    if (category && category !== 'ALL') {
        query += ` WHERE l.category = ?`;
        params.push(category);
    }

    query += ` ORDER BY l.timestamp DESC LIMIT 100`;

    const result = db.exec(query, params);

    if (result.length === 0) {
        res.json({ logs: [] });
        return;
    }

    const logs = result[0].values.map(row => ({
        id: row[0],
        action: row[1],
        category: row[2],
        details: row[3] ? JSON.parse(row[3] as string) : null,
        timestamp: row[4],
        email: row[5]
    }));

    res.json({ logs });
});

export default router;
