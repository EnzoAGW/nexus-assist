import { Agent } from "@mastra/core/agent";
import { UNPARSEABLE, classificationSchema } from "./classification";
import { isLlmUnavailable, LlmUnavailableError, type LlmPort, type LlmUsage } from "./port";
import { resolveModel } from "./model";
import { CLASSIFIER_INSTRUCTIONS, agentInstructions, renderForClassifier } from "./prompts";
import { buildTools, pickTools } from "../tools/mastra-tools";
import type { ChatMessage } from "./port";

/** O Mastra limita os passos do agent em silêncio; fixamos para um laço de tools não ser cortado sem aviso. */
export const MAX_AGENT_STEPS = 5;

const toUsage = (u: { inputTokens?: number; outputTokens?: number } | undefined): LlmUsage => ({
    inputTokens: u?.inputTokens ?? 0,
    outputTokens: u?.outputTokens ?? 0,
    calls: 1,
});

/** Cota e rede viram LlmUnavailableError (o chat se recupera); o resto continua sendo erro de verdade. */
const wrapError = (err: unknown): unknown => (isLlmUnavailable(err) ? new LlmUnavailableError({ cause: err }) : err);
const toModelMessages = (history: ChatMessage[]) =>
    history.map((m) =>
        m.role === "user"
            ? { role: "user" as const, content: m.content }
            : { role: "assistant" as const, content: m.content },
    );
const errorFromChunk = (chunk: unknown): unknown =>
    (chunk as { payload?: { error?: unknown } }).payload?.error ?? new Error("Erro no stream do modelo");

export function createMastraLlm(): LlmPort {
    const model = resolveModel();
    // maxRetries: 0 → com cota gratuita, retries automáticos queimam tokens em silêncio.
    const models = [{ model, maxRetries: 0 }];

    return {
        modelId: model.id,

        async classify({ history, hasPendingAction }) {
            const agent = new Agent({
                id: "classifier",
                name: "Classificador de intenção",
                instructions: CLASSIFIER_INSTRUCTIONS,
                model: models,
            });
            try {
                const res = await agent.generate([{ role: "user", content: renderForClassifier(history, hasPendingAction) }], {
                    structuredOutput: { schema: classificationSchema, errorStrategy: "fallback", fallbackValue: UNPARSEABLE },
                    maxSteps: 1,
                    modelSettings: { temperature: 0 },
                });
                const parsed = classificationSchema.safeParse(res.object);
                return { value: parsed.success ? parsed.data : UNPARSEABLE, usage: toUsage(res.usage) };
            } catch (err) {
                throw wrapError(err);
            }
        },

        async respond({ history, intent, toolset, actions, context }) {
            const agent = new Agent({
                id: "nexo-assist",
                name: "Nexo Assist",
                instructions: agentInstructions(intent, context),
                model: models,
                tools: pickTools(buildTools(actions), toolset),
            });

            let stream;
            try {
                stream = await agent.stream(toModelMessages(history), { maxSteps: MAX_AGENT_STEPS, modelSettings: { temperature: 0.2 } });
            } catch (err) {
                throw wrapError(err);
            }
            const source = stream;

            async function* text(): AsyncGenerator<string> {
                try {
                    for await (const chunk of source.fullStream) {
                        if (chunk.type === "text-delta") yield chunk.payload.text;
                        else if (chunk.type === "error") throw errorFromChunk(chunk);
                    }
                } catch (err) {
                    throw wrapError(err);
                }
            }

            return { text: text(), usage: async () => toUsage(await source.usage) };
        },
    };
}