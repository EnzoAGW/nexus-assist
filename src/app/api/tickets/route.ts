import { requireUser } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/http";
import { services } from "@/services";
import { toTicketDto } from "@/server/serialize";

export async function GET(): Promise<Response> {
    try {
        const user = await requireUser("employee");
        const tickets = await services.tickets.listForUser(user.email);
        return Response.json({ tickets: tickets.map(toTicketDto) });
    } catch (err) {
        return errorResponse(err);
    }
}