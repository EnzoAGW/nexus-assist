import type { LlmPort } from "@/agent/llm";
import { createMastraLlm } from "@/agent/mastra-llm";

// Reaproveita a instância entre recargas do `next dev`. Agents do Mastra são criados por turno.
const g = globalThis as unknown as { __nexoLlm?: LlmPort };

export function getLlm(): LlmPort {
  return (g.__nexoLlm ??= createMastraLlm());
}