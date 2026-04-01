import type { AuditResult } from "../../shared/messages";
interface IssueCardProps {
    issue: AuditResult;
    onIgnore: (id: string) => void;
}
export default function IssueCard({ issue, onIgnore }: IssueCardProps): import("react/jsx-runtime").JSX.Element;
export {};
