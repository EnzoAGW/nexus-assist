import { ZodError } from "zod";
import { describe, expect, it, vi } from "vitest";
import { AuthError, RuleError, TicketSystemUnavailableError } from "@/services/errors";
import { describeError } from "./http";

describe("describeError", () => {
  it("mapeia erros conhecidos para o status certo", () => {
    expect(describeError(new AuthError(401, "x"))).toMatchObject({ status: 401, code: "unauthenticated" });
    expect(describeError(new AuthError(403, "x"))).toMatchObject({ status: 403, code: "forbidden" });
    expect(describeError(new RuleError("not_found", "x")).status).toBe(404);
    expect(describeError(new RuleError("invalid_transition", "x")).status).toBe(409);
    expect(describeError(new TicketSystemUnavailableError("op", 3)).status).toBe(503);
    expect(describeError(new ZodError([])).status).toBe(400);
  });

  it("erro inesperado vira 500 genérico, sem vazar a mensagem interna", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const info = describeError(new Error("senha do banco: abc123"));
    expect(info.status).toBe(500);
    expect(JSON.stringify(info)).not.toContain("abc123");
    spy.mockRestore();
  });
});