import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../database';
import { JWT_SECRET } from '../config';

export interface AuthRequest extends Request {
    user?: {
        id: number;
        email: string;
        is_admin: boolean;
        is_approved: boolean;
    };
}

export function generateToken(userId: number): string {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }

    const token = authHeader.substring(7);

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
        const db = getDatabase();

        const result = db.exec(
            `SELECT id, email, is_admin, is_approved FROM users WHERE id = ?`,
            [decoded.userId]
        );

        if (result.length === 0 || result[0].values.length === 0) {
            res.status(401).json({ error: 'User not found' });
            return;
        }

        // Check if session exists for this token
        const sessionResult = db.exec(
            `SELECT id FROM user_sessions WHERE user_id = ? AND token = ?`,
            [decoded.userId, token]
        );

        if (sessionResult.length === 0 || sessionResult[0].values.length === 0) {
            res.status(401).json({ error: 'Session expired or invalidated' });
            return;
        }

        const row = result[0].values[0];
        req.user = {
            id: row[0] as number,
            email: row[1] as string,
            is_admin: row[2] === 1,
            is_approved: row[3] === 1
        };

        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

export function requireApproved(req: AuthRequest, res: Response, next: NextFunction): void {
    if (!req.user?.is_approved) {
        res.status(403).json({ error: 'Account not approved yet' });
        return;
    }
    next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
    if (!req.user?.is_admin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    next();
}
