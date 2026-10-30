import { ChatView } from "@/features/chat/chat-view";
import { getCurrentUser } from "@/lib/auth/guards";

export const metadata = { title: "Atendimento · Nexo Assist" };

export default async function ChatPage() {
    const user = await getCurrentUser();
    return <ChatView firstName={user?.name.split(" ")[0] ?? ""} />;
}