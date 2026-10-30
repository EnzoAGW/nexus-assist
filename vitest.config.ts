import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
        globalSetup: ["./vitest.global-setup.ts"],
        env: {
            SESSION_SECRET: "test-secret-test-secret-test-secret-123",
            DATABASE_URL: ":memory:",
            LLM_PROVIDER: "gemini",
        },
    },
    resolve: {
        alias: { "@": path.resolve(__dirname, "src") },
    },
});