import { getDatabase, saveDatabase } from '../database';

export type AuditCategory = 'ADMIN' | 'OPERATOR';

export function logAudit(userId: number, action: string, category: AuditCategory, details?: any): void {
    try {
        const db = getDatabase();
        const detailsStr = details ? JSON.stringify(details) : null;

        db.run(
            `INSERT INTO audit_logs (user_id, action, category, details) VALUES (?, ?, ?, ?)`,
            [userId, action, category, detailsStr]
        );
        saveDatabase();
    } catch (error) {
        console.error('Audit logging failed:', error);
    }
}
