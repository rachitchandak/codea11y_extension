import type { AuthStatePayload } from "../../shared/messages";
interface LoginViewProps {
    authState: AuthStatePayload;
    onLogin: (email: string, password: string) => void;
}
export default function LoginView({ authState, onLogin }: LoginViewProps): import("react/jsx-runtime").JSX.Element;
export {};
