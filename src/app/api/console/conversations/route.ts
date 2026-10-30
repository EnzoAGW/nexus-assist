import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/http";
import { services } from "@/services";
import { CONSOLE_FILTERS } from "@/services/analyst-console";
import { toConsoleItemDto } from "@/server/serialize";

const querySchema = z.object({
    filter: z.enum(CONSOLE_FILTERS).default("all"),
    q: z.string().max(100).default(""),
});

export async function GET(req: Request): Promise<Response> {
    try {
        const user = await requireUser("analyst");
        const params = new URL(req.url).searchParams;
        const parsed = querySchema.safeParse({
            filter: params.get("filter") ?? undefined,
            q: params.get("q") ?? undefined,
        });
        if (!parsed.success) throw parsed.error;

        const [items, counts, available] = await Promise.all([
            services.analystConsole.list(user.email, { filter: parsed.data.filter, query: parsed.data.q }),
            services.analystConsole.counts(user.email),
            services.users.isAvailable(user.email),
        ]);
        return Response.json({
            items: items.map(toConsoleItemDto),
            counts,
            me: { name: user.name, email: user.email, level: user.level, available },
        });
    } catch (err) {
        return errorResponse(err);
    }
}