import { getLlmConfig } from "./config";

export interface ModelConfig {
  id: `${string}/${string}`;
  url?: string;
  apiKey?: string;
}

/** Endpoints compatíveis com OpenAI. Sem barra no final: o Mastra acrescenta /chat/completions. */
const ENDPOINTS = {
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
} as const;

/** O único lugar que conhece provedores de LLM. Trocar de provedor = mudar o .env. */
export function resolveModel(): ModelConfig {
  const { LLM_PROVIDER: provider, LLM_MODEL: model, LLM_API_KEY: apiKey, OLLAMA_BASE_URL } = getLlmConfig();

  switch (provider) {
    case "ollama":
      return { id: `ollama/${model}` as const, url: `${OLLAMA_BASE_URL}/v1`, apiKey: "ollama" };
    case "openai":
    case "anthropic":
      return { id: `${provider}/${model}` as const, apiKey };
    case "gemini":
      // Rota nativa do Mastra para o Google: o endpoint de compatibilidade OpenAI não repassa
      // as thought signatures que o Gemini 3 exige nas chamadas de função.
      return { id: `google/${model}` as const, apiKey };
    case "groq":
    case "openrouter":
      return { id: `${provider}/${model}` as const, url: ENDPOINTS[provider], apiKey };
  }
}