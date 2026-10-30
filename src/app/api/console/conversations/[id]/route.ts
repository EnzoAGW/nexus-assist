import { requireUser } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/http";
import { services } from "@/services";
import { TicketSystemUnavailableError } from "@/services/errors";
import { toConversationDto, toMessageDto, toTicketDto } from "@/server/serialize";

type Ctx = { params: Promise<{ id: string }> };

/** Conversa, histórico e chamados do funcionário (painel direito do console). */
export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
    try {
        const user = await requireUser("analyst");
        const { id } = await params;
        const detail = await services.analystConsole.detail(user.email, id);

        const tickets = await services.tickets
            .listAsAnalyst(user.email, detail.employee.email)
            .then((list) => list.map(toTicketDto))
            .catch((err: unknown) => {
                if (err instanceof TicketSystemUnavailableError) return null;
                throw err;
            });

        return Response.json({
            conversation: toConversationDto(detail.conversation, detail.assignedAnalystName),
            employee: detail.employee,
            messages: detail.messages.map(toMessageDto),
            tickets,
        });
    } catch (err) {
        return errorResponse(err);
    }
}