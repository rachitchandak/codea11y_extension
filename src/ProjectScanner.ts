import * as fs from "fs";
import * as path from "path";

/* ------------------------------------------------------------------ *
 *  File tree node structure sent to the server for intent extraction  *
 * ------------------------------------------------------------------ */
export interface FileTreeNode {
  name: string;
  relativePath: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

/* ------------------------------------------------------------------ *
 *  Directories to skip during scanning                                *
 * ------------------------------------------------------------------ */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".vscode",
  "out",
  ".next",
  "build",
  "coverage",
  "__pycache__",
  ".cache",
  ".turbo",
]);

/* ------------------------------------------------------------------ *
 *  File extensions we consider auditable for accessibility             *
 * ------------------------------------------------------------------ */
const AUDITABLE_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".jsx",
  ".tsx",
  ".vue",
  ".svelte",
  ".astro",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".ejs",
  ".hbs",
  ".pug",
  ".erb",
]);

/* ------------------------------------------------------------------ *
 *  Build a recursive file tree from the workspace root                *
 * ------------------------------------------------------------------ */
export function buildFileTree(rootPath: string): FileTreeNode {
  return walkDir(rootPath, rootPath, path.basename(rootPath));
}

function walkDir(
  rootPath: string,
  dirPath: string,
  name: string
): FileTreeNode {
  const relativePath = path.relative(rootPath, dirPath) || ".";
  const node: FileTreeNode = {
    name,
    relativePath,
    type: "directory",
    children: [],
  };

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return node;
  }

  for (const entry of entries.sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        node.children!.push(walkDir(rootPath, fullPath, entry.name));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (AUDITABLE_EXTENSIONS.has(ext)) {
        node.children!.push({
          name: entry.name,
          relativePath: path.relative(rootPath, fullPath),
          type: "file",
        });
      }
    }
  }

  return node;
}

/* ------------------------------------------------------------------ *
 *  Flatten a file tree into an array of absolute paths                *
 * ------------------------------------------------------------------ */
export function flattenFiles(
  node: FileTreeNode,
  rootPath: string
): string[] {
  const files: string[] = [];

  if (node.type === "file") {
    files.push(path.join(rootPath, node.relativePath));
  }

  for (const child of node.children ?? []) {
    files.push(...flattenFiles(child, rootPath));
  }

  return files;
}
