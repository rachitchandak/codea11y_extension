"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolWrapper = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/* ------------------------------------------------------------------ *
 *  ToolWrapper – spawns the wcag-mapper CLI and parses its output     *
 * ------------------------------------------------------------------ */
class ToolWrapper {
    constructor(wcagMapperDir) {
        this.wcagMapperDir = wcagMapperDir;
    }
    /**
     * Run wcag-mapper against a project directory.
     *
     * @param opts.projectRoot  Absolute path to the target project
     * @param opts.url          Optional URL of an already-running dev server
     * @param opts.outputDir    Where to write report.json (defaults to <project>/wcag-report)
     * @param opts.timeout      Kill the process after this many ms (default 120 s)
     */
    async runWcagMapper(opts) {
        const outDir = opts.outputDir || path.join(opts.projectRoot, "wcag-report");
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
            const timeout = opts.timeout ?? 120000;
            const proc = (0, child_process_1.spawn)("node", args, {
                cwd: this.wcagMapperDir,
                stdio: ["pipe", "pipe", "pipe"],
            });
            // Close stdin so interactive readline prompts receive empty input
            proc.stdin.end();
            proc.stdout.on("data", (chunk) => {
                stdout += chunk.toString();
            });
            proc.stderr.on("data", (chunk) => {
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
                    const needsUrl = combined.includes("Cannot proceed") ||
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
                    const report = JSON.parse(raw);
                    resolve({ success: true, report });
                }
                catch (err) {
                    resolve({
                        success: false,
                        error: `Failed to read report: ${err.message}`,
                    });
                }
            });
        });
    }
}
exports.ToolWrapper = ToolWrapper;
//# sourceMappingURL=ToolWrapper.js.map