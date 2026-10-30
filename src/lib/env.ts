import { z } from "zod";
import { parseEnv } from "./parse-env";

const envSchema = z.object({
    DATABASE_URL: z.string().min(1).default("file:./data/nexo.db"),
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET precisa ter 32+ caracteres"),
    MAX_MESSAGES_PER_SESSION: z.coerce.number().int().positive().default(30),
    TICKETS_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
    SHOW_DEMO_ACCOUNTS: z.enum(["true", "false"]).default("true"),
});

export type Env = z.infer<typeof envSchema>;
export const env: Env = parseEnv(envSchema);