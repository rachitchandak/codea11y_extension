function normalizeBasePath(value: string | undefined): string {
    const raw = (value || '/codea11y').trim();
    if (!raw || raw === '/') {
        return '';
    }

    const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
    return withLeadingSlash.replace(/\/+$/, '');
}

export const isProduction = process.env.NODE_ENV === 'production';
export const PORT = Number(process.env.PORT || 3000);
export const HOST = process.env.HOST || '0.0.0.0';
export const APP_BASE_PATH = normalizeBasePath(process.env.APP_BASE_PATH);
export const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || `http://localhost:${PORT}${APP_BASE_PATH}`;
export const LEGACY_AUDIT_SERVER_URL = process.env.LEGACY_AUDIT_SERVER_URL || 'http://localhost:7544';

const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

export const ALLOWED_ORIGINS = configuredOrigins;

export const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? '' : 'codea11y-local-dev-secret');

export function assertProductionConfig(): void {
    if (isProduction && !JWT_SECRET) {
        throw new Error('JWT_SECRET must be set in production.');
    }
}

export function buildBasePath(route: string = ''): string {
    const sanitizedRoute = route.startsWith('/') ? route : `/${route}`;
    return `${APP_BASE_PATH}${sanitizedRoute}`;
}
