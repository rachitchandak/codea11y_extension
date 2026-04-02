import type { AuditResult } from "../../shared/messages";
interface IssueGroup {
    key: string;
    filePath: string;
    lineNumber?: number;
    selector?: string;
    label: string;
    issues: AuditResult[];
}
interface IssueCardProps {
    group: IssueGroup;
    onIgnore: (id: string) => void;
}
export default function IssueCard({ group, onIgnore }: IssueCardProps): import("react/jsx-runtime").JSX.Element;
export {};
