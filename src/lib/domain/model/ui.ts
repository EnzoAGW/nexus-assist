import { z } from "zod";
import { ticketDraftSchema } from "./schemas";

export const uiElementSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("quick_replies"), options: z.array(z.string()) }),
    z.object({ type: z.literal("ticket_list"), ticketIds: z.array(z.string()) }),
    z.object({ type: z.literal("ticket_card"), ticketId: z.string() }),
    z.object({
        type: z.literal("draft"),
        draft: ticketDraftSchema,
        dueAt: z.string(),
        priorityReason: z.string(),
        ruleId: z.string(),
    }),
    z.object({ type: z.literal("update_draft"), ticketId: z.string(), note: z.string(), reopen: z.boolean() }),
]);
export type UiElement = z.infer<typeof uiElementSchema>;

/** `messages.ui` é JSON solto no banco: valida elemento a elemento e descarta o que não reconhece. */
export function parseUi(ui: unknown): UiElement[] {
    const raw = (ui as { elements?: unknown } | null)?.elements;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((e) => {
        const parsed = uiElementSchema.safeParse(e);
        return parsed.success ? [parsed.data] : [];
    });
}