import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { extractUrlsFromText, prioritizeCandidateUrls } from '../project-config.js';

const POLL_INTERVAL_MS = 1_000;

export class ServerRunner {
  constructor(command, cwd, targetUrls, timeoutMs) {
    this.command = command;
    this.cwd = cwd;
    this.targetUrls = prioritizeCandidateUrls(Array.isArray(targetUrls) ? targetUrls : [targetUrls]);
    this.timeoutMs = timeoutMs;
    this.process = null;
    this.processError = null;
    this.resolvedUrl = this.targetUrls[0] || '';
  }

  async start() {
    console.log(`[server] Starting: ${this.command}`);
    console.log(`[server]      cwd: ${this.cwd}`);

    const existing = await this.probeAny();
    if (existing.ready) {
      throw new Error(
        `${existing.url} is already responding (HTTP ${existing.statusCode}). ` +
        'Stop it first or rerun with --skip-server.',
      );
    }

    const isWindows = process.platform === 'win32';

    this.process = spawn(this.command, {
      cwd: this.cwd,
      shell: true,
      detached: !isWindows,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data) => {
      const text = data.toString();
      this.captureUrls(text);
      process.stdout.write(`[dev-server] ${text}`);
    });

    this.process.stderr?.on('data', (data) => {
      const text = data.toString();
      this.captureUrls(text);
      process.stderr.write(`[dev-server] ${text}`);
    });

    this.process.on('error', (err) => {
      this.processError = err;
      console.error(`[server] Process error: ${err.message}`);
    });

    this.process.on('exit', (code) => {
      console.log(`[server] Process exited with code ${code}`);
    });

    await this.waitForReady();
  }

  async stop() {
    if (!this.process || this.process.killed) return;
    console.log('[server] Stopping dev server...');

    return new Promise((resolve) => {
      const proc = this.process;
      const killTimer = setTimeout(() => {
        try {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
          } else {
            process.kill(-proc.pid, 'SIGKILL');
          }
        } catch { /* ignore */ }
        resolve();
      }, 5_000);

      proc.on('exit', () => { clearTimeout(killTimer); resolve(); });

      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          process.kill(-proc.pid, 'SIGTERM');
        }
      } catch {
        clearTimeout(killTimer);
        resolve();
      }
    });
  }

  async waitForReady() {
    console.log(`[server] Waiting for server (timeout: ${this.timeoutMs}ms)...`);
    const deadline = Date.now() + this.timeoutMs;

    while (Date.now() < deadline) {
      if (this.processError) throw new Error(`Failed to start: ${this.processError.message}`);
      if (this.process?.exitCode !== null && this.process?.exitCode !== undefined) {
        throw new Error('Process exited before a URL became ready.');
      }

      const probe = await this.probeAny();
      if (probe.ready) {
        this.resolvedUrl = probe.url;
        console.log(`[server] Ready at ${probe.url} (HTTP ${probe.statusCode}).`);
        return;
      }

      await sleep(POLL_INTERVAL_MS);
    }

    throw new Error(`Server did not become ready within ${this.timeoutMs}ms. Tried: ${this.targetUrls.join(', ')}`);
  }

  async probeAny() {
    for (const url of this.targetUrls) {
      const result = await this.probe(url);
      if (result.ready) return result;
    }
    return { ready: false, statusCode: 0, url: this.targetUrls[0] || '' };
  }

  probe(url) {
    return new Promise((resolve) => {
      try {
        const parsed = new URL(url);
        const client = parsed.protocol === 'https:' ? https : http;
        const req = client.get(url, (res) => {
          res.resume();
          const code = res.statusCode ?? 0;
          resolve({ ready: code >= 200 && code < 400, statusCode: code, url });
        });
        req.on('error', () => resolve({ ready: false, statusCode: 0, url }));
        req.setTimeout(3_000, () => { req.destroy(); resolve({ ready: false, statusCode: 0, url }); });
      } catch {
        resolve({ ready: false, statusCode: 0, url });
      }
    });
  }

  captureUrls(text) {
    const urls = extractUrlsFromText(text, { includeLoopbackVariants: false });
    if (!urls.length) return;
    const keys = new Set(urls.map(getServiceKey));
    const remaining = this.targetUrls.filter((u) => !keys.has(getServiceKey(u)));
    this.targetUrls = prioritizeCandidateUrls([...urls, ...remaining]);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getServiceKey(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.port || ''}${parsed.pathname || '/'}${parsed.search || ''}`;
  } catch {
    return String(url || '');
  }
}
