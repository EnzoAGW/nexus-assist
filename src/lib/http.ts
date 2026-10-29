import { ZodError } from "zod";
import { AuthError, RuleError, TicketSystemUnavailableError, type RuleErrorCode } from "@/services/errors";

const RULE_STATUS: Record<RuleErrorCode, number> = {
  not_found: 404,
  analyst_required: 403,
  not_assigned: 403,
  invalid_transition: 409,
};

export interface ErrorInfo {
  status: number;
  code: string;
  message: string;
}

/** Nenhum detalhe interno ou stack trace chega ao cliente. */
export function describeError(err: unknown): ErrorInfo {
  if (err instanceof AuthError) {
    return { status: err.status, code: err.status === 401 ? "unauthenticated" : "forbidden", message: err.message };
  }
  if (err instanceof RuleError) return { status: RULE_STATUS[err.code], code: err.code, message: err.message };
  if (err instanceof TicketSystemUnavailableError) {
    return {
      status: 503,
      code: "ticket_system_unavailable",
      message: "O sistema de chamados está instável. Tente novamente em instantes.",
    };
  }
  if (err instanceof ZodError) return { status: 400, code: "invalid_input", message: "Dados inválidos." };

  console.error("Erro inesperado:", err);
  return { status: 500, code: "internal_error", message: "Algo deu errado. Tente novamente." };
}

export function errorResponse(err: unknown): Response {
  const { status, code, message } = describeError(err);
  return Response.json({ error: { code, message } }, { status });
}