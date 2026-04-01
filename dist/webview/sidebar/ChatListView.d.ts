interface ChatListViewProps {
    onOpenChat: (chatId: string) => void;
    onNewChat: () => void;
}
export default function ChatListView({ onOpenChat, onNewChat }: ChatListViewProps): import("react/jsx-runtime").JSX.Element;
export {};
