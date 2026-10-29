import { z } from "zod";
import { INTENTS } from "@/lib/domain/trace";

/** Saída estruturada do classificador. O tipo nasce do schema: validação e tipo nunca divergem. */
export const classificationSchema = z.object({
    intent: z.enum(INTENTS),
    /** O que o funcionário quer, em uma frase. */
    understood: z.string().min(1).max(240),
    /** 0 a 1. */
    confidence: z.number().min(0).max(1),
    /** Por que esta intenção. */
    reasoning: z.string().min(1).max(320),
});
export type Classification = z.infer<typeof classificationSchema>;

/** Quando o modelo não devolve algo válido, confiança 0 → o roteamento transfere para um analista. */
export const UNPARSEABLE: Classification = {
    intent: "clarification",
    understood: "Não foi possível interpretar a mensagem.",
    confidence: 0,
    reasoning: "A resposta do modelo não seguiu o formato esperado.",
};