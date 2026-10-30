import { TicketSystemUnavailableError } from "./errors";

export interface ResilienceOptions {
    /** 0 a 1: probabilidade de uma tentativa falhar (simula o legado instável). */
    failureRate: number;
    maxAttempts: number;
    baseDelayMs: number;
    random: () => number;
    sleep: (ms: number) => Promise<void>;
}

export const defaultResilience = (failureRate: number): ResilienceOptions => ({
    failureRate,
    maxAttempts: 3,
    baseDelayMs: 200,
    random: Math.random,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

class LegacyTransientError extends Error {
    constructor() {
        super("Indisponibilidade simulada do sistema legado");
        this.name = "LegacyTransientError";
    }
}

function isTransient(err: unknown): boolean {
    if (err instanceof LegacyTransientError) return true;
    return typeof err === "object" && err !== null && "code" in err && err.code === "SQLITE_BUSY";
}

export async function callLegacySystem<T>(
    operation: string,
    fn: () => Promise<T>,
    options: ResilienceOptions,
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
        try {
            if (options.random() < options.failureRate) throw new LegacyTransientError();
            return await fn();
        } catch (err) {
            if (!isTransient(err)) throw err;
            lastError = err;
            if (attempt < options.maxAttempts) {
                await options.sleep(options.baseDelayMs * 2 ** (attempt - 1)); // 200ms, 400ms...
            }
        }
    }

    throw new TicketSystemUnavailableError(operation, options.maxAttempts, { cause: lastError });
}