"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// All user routes require authentication
router.use(auth_1.authenticate);
// Get own API config (for the binary to fetch)
router.get('/config', auth_1.requireApproved, (req, res) => {
    const db = (0, database_1.getDatabase)();
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
router.get('/vsix', (req, res) => {
    const db = (0, database_1.getDatabase)();
    const result = db.exec(`
        SELECT filename, filepath FROM vsix_files 
        ORDER BY uploaded_at DESC LIMIT 1
    `);
    if (result.length === 0 || result[0].values.length === 0) {
        res.status(404).json({ error: 'No VSIX file available' });
        return;
    }
    const filename = result[0].values[0][0];
    const filepath = result[0].values[0][1];
    if (!fs_1.default.existsSync(filepath)) {
        res.status(404).json({ error: 'VSIX file not found on server' });
        return;
    }
    res.download(filepath, filename);
});
// Get VSIX metadata (for UI status)
router.get('/vsix/metadata', (req, res) => {
    const db = (0, database_1.getDatabase)();
    const result = db.exec(`
        SELECT filename, filepath, uploaded_at FROM vsix_files 
        ORDER BY uploaded_at DESC LIMIT 1
    `);
    if (result.length === 0 || result[0].values.length === 0) {
        res.json({ available: false });
        return;
    }
    const row = result[0].values[0];
    const filename = row[0];
    const filepath = row[1];
    const uploadedAt = row[2];
    if (!fs_1.default.existsSync(filepath)) {
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
router.get('/me', (req, res) => {
    res.json({ user: req.user });
});
exports.default = router;
//# sourceMappingURL=user.js.map