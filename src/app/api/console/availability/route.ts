import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/http";
import { services } from "@/services";

const bodySchema = z.object({ available: z.boolean() });

export async function PATCH(req: Request): Promise<Response> {
  try {
    const user = await requireUser("analyst");
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw parsed.error;

    await services.users.setAvailability(user.email, parsed.data.available);
    return Response.json({ available: parsed.data.available });
  } catch (err) {
    return errorResponse(err);
  }
}