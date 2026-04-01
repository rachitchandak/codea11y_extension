export interface FileTreeNode {
    name: string;
    relativePath: string;
    type: "file" | "directory";
    children?: FileTreeNode[];
}
export declare function buildFileTree(rootPath: string): FileTreeNode;
export declare function flattenFiles(node: FileTreeNode, rootPath: string): string[];
