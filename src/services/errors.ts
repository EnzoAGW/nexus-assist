/** O sistema de chamados legado não respondeu depois de todas as tentativas. */
export class TicketSystemUnavailableError extends Error {
  readonly attempts: number;

  constructor(operation: string, attempts: number, options?: { cause?: unknown }) {
    super(`Sistema de chamados indisponível em "${operation}" após ${attempts} tentativa(s).`, options);
    this.name = "TicketSystemUnavailableError";
    this.attempts = attempts;
  }
}

export type RuleErrorCode = "not_found" | "analyst_required" | "invalid_transition" | "not_assigned";

/** Violação de regra de negócio. As rotas mapeiam o `code` para 404, 403 ou 409. */
export class RuleError extends Error {
  readonly code: RuleErrorCode;

  constructor(code: RuleErrorCode, message: string) {
    super(message);
    this.name = "RuleError";
    this.code = code;
  }
}
export class AuthError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}