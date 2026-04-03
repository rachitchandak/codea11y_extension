import { Router, Request, Response } from 'express';
import { getDatabase } from '../database';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth';

const router = Router();

// ==========================================
// Get all LLM sessions (admin or own sessions)
// ==========================================
router.get('/sessions', authenticate, async (req: Request, res: Response) => {
    const user = (req as AuthRequest).user!;
    const db = getDatabase();

    try {
        let query: string;
        let params: any[] = [];

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
        } else {
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
        const sessions = result[0].values.map((row: any[]) => {
            const obj: any = {};
            columns.forEach((col: string, idx: number) => {
                obj[col] = row[idx];
            });
            return obj;
        });

        res.json({ sessions });
    } catch (error: any) {
        console.error('Get sessions error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Get session details with all calls (grouped)
// ==========================================
router.get('/sessions/:sessionId', authenticate, async (req: Request, res: Response) => {
    const user = (req as AuthRequest).user!;
    const { sessionId } = req.params;
    const db = getDatabase();

    try {
        // First check if user has access to this session
        const sessionCheck = db.exec(`
            SELECT user_id FROM llm_sessions WHERE id = ?
        `, [sessionId]);

        if (sessionCheck.length === 0 || sessionCheck[0].values.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const sessionUserId = sessionCheck[0].values[0][0] as number;
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
        const session: any = {};
        sessionColumns.forEach((col: string, idx: number) => {
            session[col] = sessionData[idx];
        });

        let calls: any[] = [];
        if (callsResult.length > 0 && callsResult[0].values.length > 0) {
            const callColumns = callsResult[0].columns;
            calls = callsResult[0].values.map((row: any[]) => {
                const obj: any = {};
                callColumns.forEach((col: string, idx: number) => {
                    const value = row[idx];
                    // Parse JSON fields
                    if ((col === 'request' || col === 'response') && typeof value === 'string') {
                        try {
                            obj[col] = JSON.parse(value);
                        } catch {
                            obj[col] = value;
                        }
                    } else {
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
    } catch (error: any) {
        console.error('Get session details error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// End a session (mark as complete)
// ==========================================
router.post('/sessions/:sessionId/end', authenticate, async (req: Request, res: Response) => {
    const user = (req as AuthRequest).user!;
    const { sessionId } = req.params;
    const db = getDatabase();

    try {
        // Check ownership
        const sessionCheck = db.exec(`
            SELECT user_id FROM llm_sessions WHERE id = ?
        `, [sessionId]);

        if (sessionCheck.length === 0 || sessionCheck[0].values.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const sessionUserId = sessionCheck[0].values[0][0] as number;
        if (!user.is_admin && sessionUserId !== user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        db.run(`
            UPDATE llm_sessions 
            SET ended_at = datetime('now'), status = 'completed'
            WHERE id = ?
        `, [sessionId]);

        res.json({ success: true });
    } catch (error: any) {
        console.error('End session error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Delete old sessions (admin only)
// ==========================================
router.delete('/sessions/cleanup', authenticate, requireAdmin, async (req: Request, res: Response) => {
    const { daysOld = 30 } = req.body;
    const db = getDatabase();

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
    } catch (error: any) {
        console.error('Cleanup error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

export default router;
