"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = logAudit;
const database_1 = require("../database");
function logAudit(userId, action, category, details) {
    try {
        const db = (0, database_1.getDatabase)();
        const detailsStr = details ? JSON.stringify(details) : null;
        db.run(`INSERT INTO audit_logs (user_id, action, category, details) VALUES (?, ?, ?, ?)`, [userId, action, category, detailsStr]);
        (0, database_1.saveDatabase)();
    }
    catch (error) {
        console.error('Audit logging failed:', error);
    }
}
//# sourceMappingURL=audit.js.map