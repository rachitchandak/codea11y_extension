import fs from 'node:fs';
import path from 'node:path';
import { glob, globSync } from 'glob';
import { getInstrumentationGlobPatterns, INSTRUMENTATION_IGNORE_PATTERNS } from './file-types.js';

const RESTORE_PATTERNS = getInstrumentationGlobPatterns();
const RESTORE_IGNORE = INSTRUMENTATION_IGNORE_PATTERNS;

export class BackupManager {
  constructor(sourceDir) {
    this.sourceDir = path.resolve(sourceDir);
    this.backupDir = path.join(
      path.dirname(this.sourceDir),
      `.wcag-mapper-backup_${path.basename(this.sourceDir)}_${process.pid}`,
    );
    this.hasBackup = false;
    this.backupManifest = [];
    this.boundRestore = () => this.restoreSync();
  }

  async backup() {
    console.log(`[backup] Backing up: ${this.sourceDir}`);

    if (fs.existsSync(this.backupDir)) {
      await fs.promises.rm(this.backupDir, { recursive: true, force: true });
    }

    this.backupManifest = await this.collectFiles(this.sourceDir);

    for (const rel of this.backupManifest) {
      const src = path.join(this.sourceDir, rel);
      const dest = path.join(this.backupDir, rel);
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.copyFile(src, dest);
    }

    this.hasBackup = true;
    process.on('SIGINT', this.boundRestore);
    process.on('SIGTERM', this.boundRestore);
    process.on('uncaughtException', this.boundRestore);

    console.log(`[backup] Created (${this.backupManifest.length} files).`);
  }

  async restore() {
    if (!this.hasBackup) return;
    console.log('[backup] Restoring source from backup...');

    const manifest = this.backupManifest.length
      ? this.backupManifest
      : await this.collectFiles(this.backupDir);

    for (const rel of manifest) {
      const src = path.join(this.backupDir, rel);
      const dest = path.join(this.sourceDir, rel);
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.copyFile(src, dest);
    }

    await fs.promises.rm(this.backupDir, { recursive: true, force: true }).catch(() => {});
    this.hasBackup = false;
    this.backupManifest = [];
    this.unregisterHandlers();
    console.log('[backup] Restored.');
  }

  restoreSync() {
    if (!this.hasBackup) return;
    try {
      const manifest = this.backupManifest.length
        ? this.backupManifest
        : this.collectFilesSync(this.backupDir);

      for (const rel of manifest) {
        const src = path.join(this.backupDir, rel);
        const dest = path.join(this.sourceDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }

      fs.rmSync(this.backupDir, { recursive: true, force: true });
      this.hasBackup = false;
      this.backupManifest = [];
      this.unregisterHandlers();
    } catch (error) {
      console.error('[backup] CRITICAL: Emergency restore failed!', error);
    }
  }

  async collectFiles(baseDir) {
    const files = [];
    for (const pattern of RESTORE_PATTERNS) {
      const matches = await glob(pattern, { cwd: baseDir, nodir: true, ignore: RESTORE_IGNORE });
      files.push(...matches);
    }
    return [...new Set(files)].sort();
  }

  collectFilesSync(baseDir) {
    const files = [];
    for (const pattern of RESTORE_PATTERNS) {
      const matches = globSync(pattern, { cwd: baseDir, nodir: true, ignore: RESTORE_IGNORE });
      files.push(...matches);
    }
    return [...new Set(files)].sort();
  }

  unregisterHandlers() {
    process.removeListener('SIGINT', this.boundRestore);
    process.removeListener('SIGTERM', this.boundRestore);
    process.removeListener('uncaughtException', this.boundRestore);
  }
}
