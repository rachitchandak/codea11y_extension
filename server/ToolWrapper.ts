import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

/* ------------------------------------------------------------------ *
 *  wcag-mapper report types                                           *
 * ------------------------------------------------------------------ */
export interface WcagMapperGuideline {
  scId: string;
  title: string;
  level: string;
  category: string;
}

export interface WcagMapperContrastFinding {
  foreground: string;
  background: string;
  contrastRatio: number;
  requiredRatio: number;
  passes: boolean;
  isLargeText: boolean;
  domSelector?: string | null;
  selectorHint?: string | null;
  text?: string | null;
}

export interface WcagMapperFile {
  path: string;
  guidelines: WcagMapperGuideline[];
  contrastFindings?: WcagMapperContrastFinding[];
}

export interface WcagMapperReport {
  generatedAt: string;
  project: { root: string; framework: string; url: string };
  files: WcagMapperFile[];
  summary: {
    files: number;
    uniqueGuidelines: number;
    contrastFailures: number;
  };
}

export interface WcagMapperResult {
  success: boolean;
  needsUrl?: boolean;
  report?: WcagMapperReport;
  error?: string;
}

/* ------------------------------------------------------------------ *
 *  ToolWrapper – spawns the wcag-mapper CLI and parses its output     *
 * ------------------------------------------------------------------ */
export class ToolWrapper {
  constructor(private wcagMapperDir: string) {}

  /**
   * Run wcag-mapper against a project directory.
   *
   * @param opts.projectRoot  Absolute path to the target project
   * @param opts.url          Optional URL of an already-running dev server
   * @param opts.outputDir    Where to write report.json (defaults to <project>/wcag-report)
   * @param opts.timeout      Kill the process after this many ms (default 120 s)
   */
  async runWcagMapper(opts: {
    projectRoot: string;
    url?: string;
    outputDir?: string;
    timeout?: number;
  }): Promise<WcagMapperResult> {
    const outDir =
      opts.outputDir || path.join(opts.projectRoot, "wcag-report");
    const reportPath = path.join(outDir, "report.json");

    const args = [
      path.join(this.wcagMapperDir, "src", "index.js"),
      opts.projectRoot,
      `--out=${outDir}`,
    ];

    if (opts.url) {
      args.push(`--url=${opts.url}`, "--skip-server");
    }

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      const timeout = opts.timeout ?? 120_000;

      const proc = spawn("node", args, {
        cwd: this.wcagMapperDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Close stdin so interactive readline prompts receive empty input
      proc.stdin.end();

      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        resolve({
          success: false,
          error: "wcag_mapper timed out",
        });
      }, timeout);

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({ success: false, error: err.message });
      });

      proc.on("close", (code) => {
        clearTimeout(timer);

        if (code !== 0) {
          const combined = stdout + stderr;
          const needsUrl =
            combined.includes("Cannot proceed") ||
            combined.includes("No start command");
          resolve({
            success: false,
            needsUrl,
            error: `wcag_mapper exited with code ${code}`,
          });
          return;
        }

        try {
          const raw = fs.readFileSync(reportPath, "utf-8");
          const report = JSON.parse(raw) as WcagMapperReport;
          resolve({ success: true, report });
        } catch (err: any) {
          resolve({
            success: false,
            error: `Failed to read report: ${err.message}`,
          });
        }
      });
    });
  }
}
