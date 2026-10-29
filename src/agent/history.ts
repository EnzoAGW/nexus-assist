import type { Message } from "@/services/conversations";
import type { ChatMessage } from "./llm";

export function toChatHistory(messages: readonly Pick<Message, "role" | "content">[]): ChatMessage[] {
    const out: ChatMessage[] = [];
    for (const m of messages) {
        if (m.role === "user") out.push({ role: "user", content: m.content });
        else if (m.role === "agent") out.push({ role: "assistant", content: m.content });
        else if (m.role === "analyst") out.push({ role: "assistant", content: `[Analista] ${m.content}` });
    }
    return out;
}

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max)}…` : text);

export function buildHandoffSummary(history: readonly ChatMessage[], understood: string): string {
    const lastUser = history
        .filter((m) => m.role === "user")
        .slice(-3)
        .map((m) => `"${clip(m.content, 200)}"`);
    return `${understood} Últimas mensagens do funcionário: ${lastUser.join(" | ")}`;
}