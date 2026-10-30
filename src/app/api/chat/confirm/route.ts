import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/http";
import { services } from "@/services/index";
import { resolveButton } from "@/server/resolve-button";
import { toMessageDto } from "@/server/serialize";

 

const bodySchema = z.object({ decision: z.enum(["confirm", "cancel"]) });

export async function POST(req: Request): Promise<Response> {
    try {
        const user = await requireUser("employee");
        const parsed = bodySchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) throw parsed.error;

        const conv = await services.conversations.getOrCreateForUser(user.email);
        const { userMessage, agentMessage } = await resolveButton(services, user.email, conv.id, parsed.data.decision);
        const fresh = await services.conversations.getForUser(user.email, conv.id);

        return Response.json({
            userMessage: toMessageDto(userMessage),
            agentMessage: toMessageDto(agentMessage),
            state: fresh?.state ?? conv.state,
            hasPendingAction: fresh?.pendingAction != null,
        });
    } catch (err) {
        return errorResponse(err);
    }
}