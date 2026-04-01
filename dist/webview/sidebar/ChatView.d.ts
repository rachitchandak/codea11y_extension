interface ChatViewProps {
    chatId: string;
    chatTitle: string;
    onBack: () => void;
    onTitleChanged: (chatId: string, newTitle: string) => void;
}
export default function ChatView({ chatId, chatTitle, onBack, onTitleChanged }: ChatViewProps): import("react/jsx-runtime").JSX.Element;
export {};
