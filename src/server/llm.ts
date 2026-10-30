import type { LlmPort } from "@/agent/llm/port";
import { createMastraLlm } from "@/agent/llm/mastra-adapter";

// Reaproveita a instância entre recargas do `next dev`. Agents do Mastra são criados por turno.
const g = globalThis as unknown as { __nexoLlm?: LlmPort };

export function getLlm(): LlmPort {
  return (g.__nexoLlm ??= createMastraLlm());
}