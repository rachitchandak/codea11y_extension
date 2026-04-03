import { Request, Response, NextFunction } from 'express';
export interface AuthRequest extends Request {
    user?: {
        id: number;
        email: string;
        is_admin: boolean;
        is_approved: boolean;
    };
}
export declare function generateToken(userId: number): string;
export declare function authenticate(req: AuthRequest, res: Response, next: NextFunction): void;
export declare function requireApproved(req: AuthRequest, res: Response, next: NextFunction): void;
export declare function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map