import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { describeError, errorResponse } from "@/lib/http";
import { sseResponse } from "@/lib/sse";
import { services } from "@/services/index";
import { TicketSystemUnavailableError } from "@/services/errors";
import { chatEvents } from "@/server/chat-stream";
import { getLlm } from "@/server/llm";
import { toMessageDto, toTicketDto } from "@/server/serialize";

const bodySchema = z.object({ text: z.string().trim().min(1).max(2000) });

/** Histórico da conversa (história 6: voltar outro dia e continuar de onde parou). */
export async function GET(): Promise<Response> {
    try {
        const user = await requireUser("employee");
        const conv = await services.conversations.getOrCreateForUser(user.email);

        const messages = await services.conversations.listMessages(conv.id, 100);
        // O histórico carrega mesmo com o sistema de chamados fora; a UI mostra um aviso no lugar dos cards.
        const tickets = await services.tickets
            .listForUser(user.email)
            .then((list) => list.map(toTicketDto))
            .catch((err: unknown) => {
                if (err instanceof TicketSystemUnavailableError) return null;
                throw err;
            });

        return Response.json({
            conversation: {
                id: conv.id,
                state: conv.state,
                hasPendingAction: conv.pendingAction !== null,
                session: { used: conv.sessionMessageCount, limit: env.MAX_MESSAGES_PER_SESSION },
            },
            messages: messages.map(toMessageDto),
            tickets,
        });
    } catch (err) {
        return errorResponse(err);
    }
}

export async function POST(req: Request): Promise<Response> {
    try {
        const user = await requireUser("employee");
        const parsed = bodySchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) throw parsed.error;

        const conv = await services.conversations.getOrCreateForUser(user.email);

        return sseResponse(
            chatEvents(
                { llm: getLlm(), services, maxMessages: env.MAX_MESSAGES_PER_SESSION },
                { userEmail: user.email, conversationId: conv.id, text: parsed.data.text },
            ),
            (err) => ({ event: "error", data: describeError(err) }),
        );
    } catch (err) {
        return errorResponse(err);
    }
}