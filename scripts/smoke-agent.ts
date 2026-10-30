import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { resolveModel } from "../src/agent/llm/model";

const countTickets = createTool({
    id: "countTickets",
    description: "Retorna quantos chamados abertos o funcionário tem.",
    inputSchema: z.object({}),
    execute: async () => ({ count: 3 }),
});

async function run(agent: Agent, label: string) {
    const started = Date.now();
    try {
        const res = await agent.generate("Quantos chamados abertos eu tenho?");
        console.log(`[${label}] ${Date.now() - started} ms | ${res.text.trim()} | tokens: ${res.usage?.totalTokens}`);
    } catch (err) {
        const e = err as { statusCode?: number; message?: string };
        console.log(`[${label}] ERRO após ${Date.now() - started} ms | status ${e.statusCode ?? "?"} | ${e.message}`);
    }
}

async function main() {
    const model = resolveModel();
    console.log(`Modelo: ${model.id}${model.url ? ` (${model.url})` : ""}`);

    const agent = new Agent({
        id: "smoke",
        name: "smoke",
        instructions: "Responda em português, em uma frase. Use a ferramenta para saber quantos chamados existem.",
        model: [{ model, maxRetries: 0 }],
        tools: { countTickets },
    });

    await run(agent, "execução 1");
    await run(agent, "execução 2");
}

main().catch((err) => {
    console.error("FALHOU:", err);
    process.exit(1);
});