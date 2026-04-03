"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../utils/audit");
const router = (0, express_1.Router)();
// Configure multer for VSIX uploads
const uploadDir = path_1.default.join(__dirname, '..', '..', 'data', 'uploads');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        cb(null, `${timestamp}-${file.originalname}`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB max file size
    },
    fileFilter: (req, file, cb) => {
        if (path_1.default.extname(file.originalname).toLowerCase() === '.vsix') {
            cb(null, true);
        }
        else {
            cb(new Error('Only .vsix files are allowed'));
        }
    }
});
// All admin routes require authentication and admin role
router.use(auth_1.authenticate, auth_1.requireAdmin);
// List all users
router.get('/users', (req, res) => {
    const db = (0, database_1.getDatabase)();
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
router.post('/users/:id/approve', (req, res) => {
    const userId = parseInt(req.params.id);
    const db = (0, database_1.getDatabase)();
    db.run(`UPDATE users SET is_approved = 1 WHERE id = ?`, [userId]);
    (0, audit_1.logAudit)(req.user?.id, 'APPROVE_USER', 'ADMIN', { targetUserId: userId });
    (0, database_1.saveDatabase)();
    res.json({ message: 'User approved' });
});
// Reject (delete) user
router.post('/users/:id/reject', (req, res) => {
    const userId = parseInt(req.params.id);
    const db = (0, database_1.getDatabase)();
    // Don't allow deleting yourself
    if (userId === req.user?.id) {
        res.status(400).json({ error: 'Cannot delete your own account' });
        return;
    }
    db.run(`DELETE FROM api_configs WHERE user_id = ?`, [userId]);
    db.run(`DELETE FROM users WHERE id = ?`, [userId]);
    (0, audit_1.logAudit)(req.user?.id, 'DELETE_USER', 'ADMIN', { targetUserId: userId });
    (0, database_1.saveDatabase)();
    res.json({ message: 'User deleted' });
});
// Set user API config
router.put('/users/:id/config', (req, res) => {
    const userId = parseInt(req.params.id);
    const { azure_api_key, azure_resource_name, azure_deployment_name, worker_deployment_name, api_version } = req.body;
    const db = (0, database_1.getDatabase)();
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
    }
    else {
        // Insert new
        db.run(`
            INSERT INTO api_configs (user_id, azure_api_key, azure_resource_name, azure_deployment_name, worker_deployment_name, api_version)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [userId, azure_api_key, azure_resource_name, azure_deployment_name, worker_deployment_name, api_version || '2025-01-01-preview']);
    }
    (0, database_1.saveDatabase)();
    (0, audit_1.logAudit)(req.user?.id, 'UPDATE_CONFIG', 'ADMIN', { targetUserId: userId });
    res.json({ message: 'Config updated' });
});
// Upload VSIX
router.post('/vsix/upload', upload.single('vsix'), (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
    }
    const db = (0, database_1.getDatabase)();
    db.run(`
        INSERT INTO vsix_files (filename, filepath, uploaded_by)
        VALUES (?, ?, ?)
    `, [req.file.originalname, req.file.path, req.user?.id]);
    (0, audit_1.logAudit)(req.user?.id, 'UPLOAD_VSIX', 'ADMIN', { filename: req.file.originalname });
    (0, database_1.saveDatabase)();
    res.json({ message: 'VSIX uploaded successfully', filename: req.file.originalname });
});
// List VSIX files
router.get('/vsix', (req, res) => {
    const db = (0, database_1.getDatabase)();
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
router.delete('/vsix/:id', (req, res) => {
    const fileId = parseInt(req.params.id);
    const db = (0, database_1.getDatabase)();
    // Get file path first
    const result = db.exec(`SELECT filepath FROM vsix_files WHERE id = ?`, [fileId]);
    if (result.length > 0 && result[0].values.length > 0) {
        const filepath = result[0].values[0][0];
        if (fs_1.default.existsSync(filepath)) {
            try {
                fs_1.default.unlinkSync(filepath);
            }
            catch (err) {
                console.error('Failed to delete VSIX file:', err);
            }
        }
        // Remove from database even if file missing (cleanup ghost records)
        db.run(`DELETE FROM vsix_files WHERE id = ?`, [fileId]);
        (0, audit_1.logAudit)(req.user?.id, 'DELETE_VSIX', 'ADMIN', { vsixId: fileId });
    }
    res.json({ message: 'VSIX deleted' });
});
// List Password Reset Requests
router.get('/reset-requests', (req, res) => {
    const db = (0, database_1.getDatabase)();
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
router.post('/reset-requests/:id/approve', async (req, res) => {
    try {
        const requestId = parseInt(req.params.id);
        const db = (0, database_1.getDatabase)();
        // Get user_id from request
        const requestResult = db.exec(`SELECT user_id FROM password_reset_requests WHERE id = ?`, [requestId]);
        if (requestResult.length === 0 || requestResult[0].values.length === 0) {
            res.status(404).json({ error: 'Request not found' });
            return;
        }
        const userId = requestResult[0].values[0][0];
        // Get user email to set as password
        const userResult = db.exec(`SELECT email FROM users WHERE id = ?`, [userId]);
        if (userResult.length === 0 || userResult[0].values.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const email = userResult[0].values[0][0];
        // Reset password to email address and force change, and clear lockout counters
        const passwordHash = await bcryptjs_1.default.hash(email, 10);
        db.run(`UPDATE users SET password_hash = ?, force_password_change = 1, failed_attempts = 0, lockout_until = NULL, lockout_count = 0 WHERE id = ?`, [passwordHash, userId]);
        db.run(`UPDATE password_reset_requests SET status = 'approved' WHERE id = ?`, [requestId]);
        (0, audit_1.logAudit)(req.user?.id, 'APPROVE_RESET', 'ADMIN', { targetUserId: userId, requestId });
        (0, database_1.saveDatabase)();
        res.json({ message: 'Password reset to user email address' });
    }
    catch (error) {
        console.error('Approve reset error:', error);
        res.status(500).json({ error: 'Failed to approve reset' });
    }
});
// Reject Password Reset Request
router.post('/reset-requests/:id/reject', (req, res) => {
    const requestId = parseInt(req.params.id);
    const db = (0, database_1.getDatabase)();
    db.run(`UPDATE password_reset_requests SET status = 'rejected' WHERE id = ?`, [requestId]);
    (0, audit_1.logAudit)(req.user?.id, 'REJECT_RESET', 'ADMIN', { requestId });
    (0, database_1.saveDatabase)();
    res.json({ message: 'Request rejected' });
});
// Get Audit Logs
router.get('/audit-logs', (req, res) => {
    const { category } = req.query;
    const db = (0, database_1.getDatabase)();
    let query = `
        SELECT l.id, l.action, l.category, l.details, l.timestamp, u.email
        FROM audit_logs l
        JOIN users u ON l.user_id = u.id
    `;
    const params = [];
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
        details: row[3] ? JSON.parse(row[3]) : null,
        timestamp: row[4],
        email: row[5]
    }));
    res.json({ logs });
});
exports.default = router;
//# sourceMappingURL=admin.js.map