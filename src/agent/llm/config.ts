import { z } from "zod";
import { parseEnv } from "@/lib/parse-env";

export const llmSchema = z
  .object({
    LLM_PROVIDER: z.enum(["gemini", "groq", "openrouter", "ollama", "openai", "anthropic"]).default("gemini"),
    LLM_MODEL: z.string().min(1).default("gemini-3.5-flash"),
    /** Chave do provedor escolhido. Não é necessária com ollama. */
    LLM_API_KEY: z.string().optional(),
    /** Só para LLM_PROVIDER=ollama. */
    OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.LLM_PROVIDER !== "ollama" && !cfg.LLM_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["LLM_API_KEY"],
        message: `Obrigatória com LLM_PROVIDER=${cfg.LLM_PROVIDER}. Veja o .env.example`,
      });
    }
  });

export type LlmConfig = z.output<typeof llmSchema>;

let cached: LlmConfig | undefined;

/** Falha com mensagem clara na primeira vez que o agent precisa do modelo, não antes. */
export function getLlmConfig(): LlmConfig {
  cached ??= parseEnv(llmSchema);
  return cached;
}