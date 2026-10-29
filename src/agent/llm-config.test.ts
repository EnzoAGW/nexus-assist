import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/parse-env";
import { llmSchema } from "./llm-config";

describe("configuração do LLM", () => {
  it("provedor hospedado exige a chave", () => {
    expect(() => parseEnv(llmSchema, { LLM_PROVIDER: "gemini" })).toThrow(/LLM_API_KEY/);
  });

  it("ollama dispensa a chave", () => {
    expect(parseEnv(llmSchema, { LLM_PROVIDER: "ollama", LLM_MODEL: "qwen2.5:7b" }).LLM_PROVIDER).toBe("ollama");
  });

  it("com a chave, usa o padrão do Gemini", () => {
    expect(parseEnv(llmSchema, { LLM_API_KEY: "k" })).toMatchObject({ LLM_PROVIDER: "gemini" });
  });
});