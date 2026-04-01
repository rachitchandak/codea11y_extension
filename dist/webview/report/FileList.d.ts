interface FileEntry {
    filePath: string;
    issueCount: number;
}
interface FileListProps {
    files: FileEntry[];
    selectedFile: string | null;
    onSelectFile: (filePath: string) => void;
}
export default function FileList({ files, selectedFile, onSelectFile, }: FileListProps): import("react/jsx-runtime").JSX.Element;
export {};
