import type { Intent } from "@/lib/domain/model/trace";
import type { TurnActions } from "../tools/actions";
import type { Classification } from "./classification";
import type { ToolName } from "../tools/names";

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

export interface LlmUsage {
    inputTokens: number;
    outputTokens: number;
    calls: number;
}

export const NO_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };

export const addUsage = (a: LlmUsage, b: LlmUsage): LlmUsage => ({
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    calls: a.calls + b.calls,
});

export interface LlmPort {
    readonly modelId: string;
    classify(input: {
        history: ChatMessage[];
        hasPendingAction: boolean;
    }): Promise<{ value: Classification; usage: LlmUsage }>;
    respond(input: {
        history: ChatMessage[];
        intent: Intent;
        toolset: readonly ToolName[];
        actions: TurnActions;
        /** Resultado das consultas feitas pelo código antes do modelo. */
        context: string;
    }): Promise<{ text: AsyncIterable<string>; usage: () => Promise<LlmUsage> }>;
}

export class LlmUnavailableError extends Error {
    constructor(options?: { cause?: unknown }) {
        super("O modelo de linguagem está indisponível ou sem cota.", options);
        this.name = "LlmUnavailableError";
    }
}

const NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "UND_ERR_CONNECT_TIMEOUT"]);

export function isLlmUnavailable(err: unknown): boolean {
    let current: unknown = err;
    for (let depth = 0; depth < 4 && current; depth++) {
        const e = current as { statusCode?: unknown; code?: unknown; cause?: unknown };
        if (typeof e.statusCode === "number" && (e.statusCode === 429 || e.statusCode >= 500)) return true;
        if (typeof e.code === "string" && NETWORK_CODES.has(e.code)) return true;
        current = e.cause;
    }
    return false;
}