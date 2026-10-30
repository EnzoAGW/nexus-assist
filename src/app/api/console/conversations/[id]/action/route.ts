import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/http";
import { services } from "@/services/index";
import { toConversationDto } from "@/server/serialize";

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({ action: z.enum(["claim", "return", "close"]) });

/** Assumir (agent pausado), devolver ao agent ou encerrar. As regras e a concorrência estão no serviço. */
export async function POST(req: Request, { params }: Ctx): Promise<Response> {
    try {
        const user = await requireUser("analyst");
        const { id } = await params;
        const parsed = bodySchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) throw parsed.error;

        const svc = services.conversations;
        const conversation =
            parsed.data.action === "claim"
                ? await svc.claim(user.email, id)
                : parsed.data.action === "return"
                    ? await svc.returnToAgent(user.email, id)
                    : await svc.close(user.email, id);

        return Response.json({ conversation: toConversationDto(conversation, conversation.assignedAnalystEmail ? user.name : null) });
    } catch (err) {
        return errorResponse(err);
    }
}