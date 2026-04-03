interface ChatListViewProps {
    onOpenChat: (chatId: string) => void;
    onNewChat: () => void;
    onLogout: () => void;
}
export default function ChatListView({ onOpenChat, onNewChat, onLogout }: ChatListViewProps): import("react/jsx-runtime").JSX.Element;
export {};
