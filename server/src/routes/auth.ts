import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import zxcvbn from 'zxcvbn';
import { getDatabase, saveDatabase } from '../database';
import { AuthRequest, generateToken, authenticate } from '../middleware/auth';
import { logAudit } from '../utils/audit';

const router = Router();

// Password policy: min 8 characters, 1 uppercase, 1 lowercase, 1 digit, 1 special character
function validatePassword(password: string): string | null {
    if (!password || password.length < 8) {
        return 'Password must be at least 8 characters long';
    }
    if (!/[A-Z]/.test(password)) {
        return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(password)) {
        return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(password)) {
        return 'Password must contain at least one digit';
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
        return 'Password must contain at least one special character';
    }
    // zxcvbn strength check: reject passwords with score <= 2 (scale 0-4)
    const strength = zxcvbn(password);
    if (strength.score <= 2) {
        const warning = strength.feedback.warning
            ? ` (${strength.feedback.warning})`
            : '';
        const suggestion = strength.feedback.suggestions.length > 0
            ? `. ${strength.feedback.suggestions.join('. ')}`
            : '';
        return `Password is too weak${warning}. Please choose a stronger password${suggestion}`;
    }
    return null;
}

// Register new user
router.post('/register', async (req: AuthRequest, res: Response) => {
    try {
        const { email, password, security_question, security_answer } = req.body;

        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }

        const passwordError = validatePassword(password);
        if (passwordError) {
            res.status(400).json({ error: passwordError });
            return;
        }

        if (!security_question || !security_answer) {
            res.status(400).json({ error: 'Security question and answer are required' });
            return;
        }

        const db = getDatabase();

        // Check if email already exists
        const existing = db.exec(`SELECT id FROM users WHERE email = ?`, [email]);
        if (existing.length > 0 && existing[0].values.length > 0) {
            res.status(400).json({ error: 'Email already registered' });
            return;
        }

        // Hash password and security answer
        const passwordHash = await bcrypt.hash(password, 10);
        const securityAnswerHash = await bcrypt.hash(security_answer.toLowerCase().trim(), 10);

        db.run(
            `INSERT INTO users (email, password_hash, security_question, security_answer_hash) VALUES (?, ?, ?, ?)`,
            [email, passwordHash, security_question, securityAnswerHash]
        );

        // Log registration (operator action, but userId not yet available for the new user easily here, 
        // we could get it but it's cleaner to log it as a guest action or use the email as detail)
        const newUserResult = db.exec(`SELECT id FROM users WHERE email = ?`, [email]);
        if (newUserResult.length > 0 && newUserResult[0].values.length > 0) {
            logAudit(newUserResult[0].values[0][0] as number, 'REGISTER', 'OPERATOR', { email });
        }

        saveDatabase();

        res.status(201).json({ message: 'Registration successful. Please wait for admin approval.' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
router.post('/login', async (req: AuthRequest, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }

        const db = getDatabase();
        const result = db.exec(
            `SELECT id, password_hash, is_approved, is_admin, force_password_change, failed_attempts, lockout_until, lockout_count FROM users WHERE email = ?`,
            [email]
        );

        if (result.length === 0 || result[0].values.length === 0) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }

        const row = result[0].values[0];
        const userId = row[0] as number;
        const passwordHash = row[1] as string;
        const isApproved = !!row[2];
        const isAdmin = !!row[3];
        const forceChangeFlag = row[4] === 1;
        let failedAttempts = (row[5] as number) || 0;
        const lockoutUntil = row[6] as string | null;
        let lockoutCount = (row[7] as number) || 0;

        // 1. Check Permanent Lockout
        if (lockoutCount >= 2) {
            res.status(403).json({ error: 'Account locked. Only admin can reset your password.' });
            return;
        }

        // 2. Check Temporary Lockout
        if (lockoutUntil) {
            const lockoutDate = new Date(lockoutUntil);
            if (lockoutDate > new Date()) {
                res.status(403).json({ error: 'Account locked, try after 15 mins.' });
                return;
            }
        }

        const passwordValid = await bcrypt.compare(password, passwordHash);

        if (!passwordValid) {
            failedAttempts++;
            let newLockoutUntil = lockoutUntil;
            let message = 'Invalid email or password';

            // Lockout after 5 failed attempts
            if (failedAttempts % 5 === 0) {
                lockoutCount++;
                if (lockoutCount === 1) {
                    const fifteenMinsLater = new Date(Date.now() + 15 * 60 * 1000);
                    newLockoutUntil = fifteenMinsLater.toISOString();
                    message = 'Account locked, try after 15 mins.';
                } else if (lockoutCount >= 2) {
                    newLockoutUntil = null; // Permanent lock
                    message = 'Account locked. Only admin can reset your password.';

                    // Auto-populate a password reset request
                    const pending = db.exec(
                        `SELECT id FROM password_reset_requests WHERE user_id = ? AND status = 'pending'`,
                        [userId]
                    );
                    if (pending.length === 0 || pending[0].values.length === 0) {
                        db.run(`INSERT INTO password_reset_requests (user_id) VALUES (?)`, [userId]);
                    }
                }
            }

            db.run(
                `UPDATE users SET failed_attempts = ?, lockout_until = ?, lockout_count = ? WHERE id = ?`,
                [failedAttempts, newLockoutUntil, lockoutCount, userId]
            );
            saveDatabase();

            res.status(401).json({ error: message });
            return;
        }

        // On success, reset all counters
        db.run(
            `UPDATE users SET failed_attempts = 0, lockout_until = NULL, lockout_count = 0 WHERE id = ?`,
            [userId]
        );

        if (!isApproved) {
            res.status(403).json({ error: 'Account not approved yet. Please contact admin.' });
            return;
        }

        // Check for default admin password (admin123) OR forced change flag
        let requirePasswordChange = forceChangeFlag;

        if (isAdmin && !requirePasswordChange) {
            const isDefaultPassword = await bcrypt.compare('admin123', passwordHash);
            if (isDefaultPassword) {
                requirePasswordChange = true;
            }
        }

        const token = generateToken(userId);

        // Store session in database
        db.run(`INSERT INTO user_sessions (user_id, token) VALUES (?, ?)`, [userId, token]);

        // Log login
        logAudit(userId, 'LOGIN', 'OPERATOR');

        saveDatabase();

        res.json({
            token,
            user: {
                id: userId,
                email,
                is_admin: isAdmin
            },
            require_password_change: requirePasswordChange
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.substring(7);

        if (token) {
            const db = getDatabase();
            db.run(`DELETE FROM user_sessions WHERE user_id = ? AND token = ?`, [req.user?.id, token]);

            if (req.user?.id) {
                logAudit(req.user.id, 'LOGOUT', 'OPERATOR');
            }

            saveDatabase();
        }

        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

// Change password (authenticated)
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const { old_password, new_password, is_forced } = req.body;
        const userId = req.user?.id;

        if (!new_password) {
            res.status(400).json({ error: 'New password is required' });
            return;
        }

        const db = getDatabase();

        // 1. If not a forced change, old_password is required and must be verified
        if (!is_forced) {
            if (!old_password) {
                res.status(400).json({ error: 'Old password is required' });
                return;
            }

            const current = db.exec(`SELECT password_hash FROM users WHERE id = ?`, [userId]);
            if (current.length === 0 || current[0].values.length === 0) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            const currentHash = current[0].values[0][0] as string;
            const validOld = await bcrypt.compare(old_password, currentHash);
            if (!validOld) {
                res.status(401).json({ error: 'Incorrect old password' });
                return;
            }
        }

        // 2. Validate new password strength
        const passwordError = validatePassword(new_password);
        if (passwordError) {
            res.status(400).json({ error: passwordError });
            return;
        }

        // 3. Update password
        const passwordHash = await bcrypt.hash(new_password, 10);
        db.run(`UPDATE users SET password_hash = ?, force_password_change = 0 WHERE id = ?`, [passwordHash, userId]);

        if (userId) {
            logAudit(userId, 'PASSWORD_CHANGE', 'OPERATOR');
        }

        saveDatabase();

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to update password' });
    }
});


// Get Security Question
router.get('/security-question/:email', async (req: AuthRequest, res: Response) => {
    try {
        const { email } = req.params;
        const db = getDatabase();

        const result = db.exec(`SELECT security_question FROM users WHERE email = ?`, [email]);

        if (result.length === 0 || result[0].values.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const question = result[0].values[0][0];
        if (!question) {
            res.status(404).json({ error: 'No security question set for this user' });
            return;
        }

        res.json({ security_question: question });
    } catch (error) {
        console.error('Get security question error:', error);
        res.status(500).json({ error: 'Failed to get security question' });
    }
});

// Reset Password with Security Question
router.post('/reset-password-question', async (req: AuthRequest, res: Response) => {
    try {
        const { email, security_answer, new_password } = req.body;

        if (!email || !security_answer || !new_password) {
            res.status(400).json({ error: 'All fields are required' });
            return;
        }

        const passwordError = validatePassword(new_password);
        if (passwordError) {
            res.status(400).json({ error: passwordError });
            return;
        }

        const db = getDatabase();
        const result = db.exec(
            `SELECT id, security_answer_hash FROM users WHERE email = ?`,
            [email]
        );

        if (result.length === 0 || result[0].values.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const row = result[0].values[0];
        const userId = row[0];
        const answerHash = row[1] as string;

        if (!answerHash) {
            res.status(400).json({ error: 'User has not set a security question' });
            return;
        }

        const answerValid = await bcrypt.compare(security_answer.toLowerCase().trim(), answerHash);
        if (!answerValid) {
            res.status(401).json({ error: 'Incorrect security answer' });
            return;
        }

        const passwordHash = await bcrypt.hash(new_password, 10);
        db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, userId]);

        logAudit(userId as number, 'PASSWORD CHANGED USING SECURITY QUESTION', 'OPERATOR', { email });

        saveDatabase();

        res.json({ message: 'Password reset successfully' });

    } catch (error) {
        console.error('Security question reset error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Request Password Reset (Admin approval required)
router.post('/request-password-reset', async (req: AuthRequest, res: Response) => {
    try {
        const { email } = req.body;
        const db = getDatabase();

        const result = db.exec(`SELECT id FROM users WHERE email = ?`, [email]);
        if (result.length === 0 || result[0].values.length === 0) {
            // Silently fail to prevent enumeration or return ambiguous message
            res.json({ message: 'If account exists, reset request has been sent to admins.' });
            return;
        }

        const userId = result[0].values[0][0];

        // Check if pending request exists
        const pending = db.exec(
            `SELECT id FROM password_reset_requests WHERE user_id = ? AND status = 'pending'`,
            [userId]
        );

        if (pending.length > 0 && pending[0].values.length > 0) {
            res.json({ message: 'Request already pending.' });
            return;
        }

        db.run(`INSERT INTO password_reset_requests (user_id) VALUES (?)`, [userId]);
        saveDatabase();

        res.json({ message: 'Password reset requested. Admin will review.' });
    } catch (error) {
        console.error('Request reset error:', error);
        res.status(500).json({ error: 'Failed to request reset' });
    }
});

// Get current user info
router.get('/me', authenticate, (req: AuthRequest, res: Response) => {
    res.json({ user: req.user });
});

export default router;
