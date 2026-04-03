"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.authenticate = authenticate;
exports.requireApproved = requireApproved;
exports.requireAdmin = requireAdmin;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../database");
const config_1 = require("../config");
function generateToken(userId) {
    return jsonwebtoken_1.default.sign({ userId }, config_1.JWT_SECRET, { expiresIn: '7d' });
}
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }
    const token = authHeader.substring(7);
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.JWT_SECRET);
        const db = (0, database_1.getDatabase)();
        const result = db.exec(`SELECT id, email, is_admin, is_approved FROM users WHERE id = ?`, [decoded.userId]);
        if (result.length === 0 || result[0].values.length === 0) {
            res.status(401).json({ error: 'User not found' });
            return;
        }
        // Check if session exists for this token
        const sessionResult = db.exec(`SELECT id FROM user_sessions WHERE user_id = ? AND token = ?`, [decoded.userId, token]);
        if (sessionResult.length === 0 || sessionResult[0].values.length === 0) {
            res.status(401).json({ error: 'Session expired or invalidated' });
            return;
        }
        const row = result[0].values[0];
        req.user = {
            id: row[0],
            email: row[1],
            is_admin: row[2] === 1,
            is_approved: row[3] === 1
        };
        next();
    }
    catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
}
function requireApproved(req, res, next) {
    if (!req.user?.is_approved) {
        res.status(403).json({ error: 'Account not approved yet' });
        return;
    }
    next();
}
function requireAdmin(req, res, next) {
    if (!req.user?.is_admin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    next();
}
//# sourceMappingURL=auth.js.map