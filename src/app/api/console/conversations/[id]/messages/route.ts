import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/http";
import { services } from "@/services";
import { toMessageDto } from "@/server/serialize";

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({ text: z.string().trim().min(1).max(2000) });

export async function POST(req: Request, { params }: Ctx): Promise<Response> {
    try {
        const user = await requireUser("analyst");
        const { id } = await params;
        const parsed = bodySchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) throw parsed.error;

        const message = await services.conversations.postAnalystMessage(user.email, id, parsed.data.text);
        return Response.json({ message: toMessageDto(message) });
    } catch (err) {
        return errorResponse(err);
    }
}