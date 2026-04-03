"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_SECRET = exports.ALLOWED_ORIGINS = exports.LEGACY_AUDIT_SERVER_URL = exports.PUBLIC_APP_URL = exports.APP_BASE_PATH = exports.HOST = exports.PORT = exports.isProduction = void 0;
exports.assertProductionConfig = assertProductionConfig;
exports.buildBasePath = buildBasePath;
function normalizeBasePath(value) {
    const raw = (value || '/codea11y').trim();
    if (!raw || raw === '/') {
        return '';
    }
    const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
    return withLeadingSlash.replace(/\/+$/, '');
}
exports.isProduction = process.env.NODE_ENV === 'production';
exports.PORT = Number(process.env.PORT || 3000);
exports.HOST = process.env.HOST || '0.0.0.0';
exports.APP_BASE_PATH = normalizeBasePath(process.env.APP_BASE_PATH);
exports.PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || `http://localhost:${exports.PORT}${exports.APP_BASE_PATH}`;
exports.LEGACY_AUDIT_SERVER_URL = process.env.LEGACY_AUDIT_SERVER_URL || 'http://localhost:7544';
const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
exports.ALLOWED_ORIGINS = configuredOrigins;
exports.JWT_SECRET = process.env.JWT_SECRET || (exports.isProduction ? '' : 'codea11y-local-dev-secret');
function assertProductionConfig() {
    if (exports.isProduction && !exports.JWT_SECRET) {
        throw new Error('JWT_SECRET must be set in production.');
    }
}
function buildBasePath(route = '') {
    const sanitizedRoute = route.startsWith('/') ? route : `/${route}`;
    return `${exports.APP_BASE_PATH}${sanitizedRoute}`;
}
//# sourceMappingURL=config.js.map