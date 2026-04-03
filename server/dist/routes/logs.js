"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// ==========================================
// Get all LLM sessions (admin or own sessions)
// ==========================================
router.get('/sessions', auth_1.authenticate, async (req, res) => {
    const user = req.user;
    const db = (0, database_1.getDatabase)();
    try {
        let query;
        let params = [];
        if (user.is_admin) {
            query = `
                SELECT 
                    s.id as sessionId,
                    s.user_id as userId,
                    u.email as userEmail,
                    s.started_at as startedAt,
                    s.ended_at as endedAt,
                    s.status,
                    (SELECT COUNT(*) FROM llm_calls WHERE session_id = s.id) as totalCalls,
                    (SELECT SUM(tokens_used) FROM llm_calls WHERE session_id = s.id) as totalTokens
                FROM llm_sessions s
                LEFT JOIN users u ON s.user_id = u.id
                ORDER BY s.started_at DESC
                LIMIT 100
            `;
        }
        else {
            query = `
                SELECT 
                    s.id as sessionId,
                    s.user_id as userId,
                    s.started_at as startedAt,
                    s.ended_at as endedAt,
                    s.status,
                    (SELECT COUNT(*) FROM llm_calls WHERE session_id = s.id) as totalCalls,
                    (SELECT SUM(tokens_used) FROM llm_calls WHERE session_id = s.id) as totalTokens
                FROM llm_sessions s
                WHERE s.user_id = ?
                ORDER BY s.started_at DESC
                LIMIT 50
            `;
            params = [user.id];
        }
        const result = db.exec(query, params);
        if (result.length === 0) {
            return res.json({ sessions: [] });
        }
        const columns = result[0].columns;
        const sessions = result[0].values.map((row) => {
            const obj = {};
            columns.forEach((col, idx) => {
                obj[col] = row[idx];
            });
            return obj;
        });
        res.json({ sessions });
    }
    catch (error) {
        console.error('Get sessions error:', error.message);
        res.status(500).json({ error: error.message });
    }
});
// ==========================================
// Get session details with all calls (grouped)
// ==========================================
router.get('/sessions/:sessionId', auth_1.authenticate, async (req, res) => {
    const user = req.user;
    const { sessionId } = req.params;
    const db = (0, database_1.getDatabase)();
    try {
        // First check if user has access to this session
        const sessionCheck = db.exec(`
            SELECT user_id FROM llm_sessions WHERE id = ?
        `, [sessionId]);
        if (sessionCheck.length === 0 || sessionCheck[0].values.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }
        const sessionUserId = sessionCheck[0].values[0][0];
        if (!user.is_admin && sessionUserId !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        // Get session info
        const sessionResult = db.exec(`
            SELECT 
                s.id as sessionId,
                s.user_id as userId,
                u.email as userEmail,
                s.started_at as startedAt,
                s.ended_at as endedAt,
                s.status
            FROM llm_sessions s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.id = ?
        `, [sessionId]);
        // Get all calls for this session
        const callsResult = db.exec(`
            SELECT 
                id,
                timestamp,
                agent_type as agentType,
                endpoint,
                request_json as request,
                response_json as response,
                duration_ms as durationMs,
                tokens_used as tokensUsed
            FROM llm_calls
            WHERE session_id = ?
            ORDER BY timestamp ASC
        `, [sessionId]);
        const sessionColumns = sessionResult[0]?.columns || [];
        const sessionData = sessionResult[0]?.values[0] || [];
        const session = {};
        sessionColumns.forEach((col, idx) => {
            session[col] = sessionData[idx];
        });
        let calls = [];
        if (callsResult.length > 0 && callsResult[0].values.length > 0) {
            const callColumns = callsResult[0].columns;
            calls = callsResult[0].values.map((row) => {
                const obj = {};
                callColumns.forEach((col, idx) => {
                    const value = row[idx];
                    // Parse JSON fields
                    if ((col === 'request' || col === 'response') && typeof value === 'string') {
                        try {
                            obj[col] = JSON.parse(value);
                        }
                        catch {
                            obj[col] = value;
                        }
                    }
                    else {
                        obj[col] = value;
                    }
                });
                return obj;
            });
        }
        // Group calls by agent type for structured view
        const groupedCalls = {
            intent: calls.filter(c => c.agentType === 'intent'),
            manager: calls.filter(c => c.agentType === 'manager'),
            workers: calls.filter(c => c.agentType === 'worker'),
            chat: calls.filter(c => c.agentType === 'chat')
        };
        res.json({
            session,
            calls,
            groupedCalls,
            summary: {
                totalCalls: calls.length,
                totalDurationMs: calls.reduce((sum, c) => sum + (c.durationMs || 0), 0),
                totalTokens: calls.reduce((sum, c) => sum + (c.tokensUsed || 0), 0),
                byAgentType: {
                    intent: groupedCalls.intent.length,
                    manager: groupedCalls.manager.length,
                    workers: groupedCalls.workers.length,
                    chat: groupedCalls.chat.length
                }
            }
        });
    }
    catch (error) {
        console.error('Get session details error:', error.message);
        res.status(500).json({ error: error.message });
    }
});
// ==========================================
// End a session (mark as complete)
// ==========================================
router.post('/sessions/:sessionId/end', auth_1.authenticate, async (req, res) => {
    const user = req.user;
    const { sessionId } = req.params;
    const db = (0, database_1.getDatabase)();
    try {
        // Check ownership
        const sessionCheck = db.exec(`
            SELECT user_id FROM llm_sessions WHERE id = ?
        `, [sessionId]);
        if (sessionCheck.length === 0 || sessionCheck[0].values.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }
        const sessionUserId = sessionCheck[0].values[0][0];
        if (!user.is_admin && sessionUserId !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        db.run(`
            UPDATE llm_sessions 
            SET ended_at = datetime('now'), status = 'completed'
            WHERE id = ?
        `, [sessionId]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('End session error:', error.message);
        res.status(500).json({ error: error.message });
    }
});
// ==========================================
// Delete old sessions (admin only)
// ==========================================
router.delete('/sessions/cleanup', auth_1.authenticate, auth_1.requireAdmin, async (req, res) => {
    const { daysOld = 30 } = req.body;
    const db = (0, database_1.getDatabase)();
    try {
        // Delete old calls first (foreign key)
        db.run(`
            DELETE FROM llm_calls 
            WHERE session_id IN (
                SELECT id FROM llm_sessions 
                WHERE started_at < datetime('now', '-${daysOld} days')
            )
        `);
        // Delete old sessions
        const result = db.run(`
            DELETE FROM llm_sessions 
            WHERE started_at < datetime('now', '-${daysOld} days')
        `);
        const { saveDatabase } = require('../database');
        saveDatabase();
        res.json({ success: true, message: `Cleaned up sessions older than ${daysOld} days` });
    }
    catch (error) {
        console.error('Cleanup error:', error.message);
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=logs.js.map