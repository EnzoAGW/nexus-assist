import type { z } from "zod";

/** Valida variáveis de ambiente com um schema e falha com uma mensagem legível. */
export function parseEnv<S extends z.ZodType>(
    schema: S,
    source: Record<string, string | undefined> = process.env,
): z.output<S> {
    const parsed = schema.safeParse(source);
    if (!parsed.success) {
        const details = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
        throw new Error(`Variáveis de ambiente inválidas:\n${details}`);
    }
    return parsed.data;
}