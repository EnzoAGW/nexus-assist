import { and, desc, eq, sql } from "drizzle-orm";
import { ticketUpdates, tickets as ticketsTable } from "@/db/schema";
import type { Db } from "@/db/types";
import { findDuplicates, type DuplicateCandidate } from "@/lib/domain/duplicates";
import type { TicketType } from "@/lib/domain/enums";
import { ticketDraftSchema, type Ticket, type TicketDraft } from "@/lib/domain/schemas";
import { computeDueAt, isActiveStatus, isOverdue } from "@/lib/domain/sla";
import { canReopen } from "@/lib/domain/ticket-rules";
import { z } from "zod";
import { callLegacySystem, type ResilienceOptions } from "./legacy";
import { createUserService, normalizeEmail } from "./users";

export type TicketView = Ticket & {
  /** Prazo da próxima atualização do service desk. */
  dueAt: Date;
  overdue: boolean;
  reopenable: boolean;
};

export type CreateResult =
  | { status: "created"; ticket: TicketView }
  | { status: "duplicate"; candidates: DuplicateCandidate<TicketView>[] };

export type UpdateResult =
  | { status: "updated"; ticket: TicketView }
  | { status: "reopened"; ticket: TicketView }
  | { status: "not_found" }
  | { status: "cannot_reopen" } // resolvido há mais de 7 dias: precisa de chamado novo
  | { status: "closed" };

export type EscalateResult =
  | { status: "escalated"; ticket: TicketView }
  | { status: "not_found" }
  | { status: "not_active" };

export interface TicketServiceOptions {
  now?: () => Date;
  resilience: ResilienceOptions;
}

const noteSchema = z.string().trim().min(1).max(2000);
const FIRST_NUMBER: Record<TicketType, number> = { INC: 20000, REQ: 10000 };

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 3 && current; depth++) {
    if (current instanceof Error && /UNIQUE|PRIMARY KEY/i.test(current.message)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function createTicketService(db: Db, options: TicketServiceOptions) {
  const clock = options.now ?? (() => new Date());
  const users = createUserService(db);
  const legacy = <T>(operation: string, fn: () => Promise<T>): Promise<T> =>
    callLegacySystem(operation, fn, options.resilience);

  const toView = (t: Ticket, at: Date): TicketView => ({
    ...t,
    dueAt: computeDueAt(t.priority, t.lastUpdatedAt),
    overdue: isOverdue(t, at),
    reopenable: canReopen(t, at),
  });

  /** PRIVACIDADE: o filtro por solicitante está na própria query. */
  async function fetchOwned(email: string, id: string): Promise<Ticket | null> {
    const [row] = await db
      .select()
      .from(ticketsTable)
      .where(and(eq(ticketsTable.id, id.trim().toUpperCase()), eq(ticketsTable.requesterEmail, email)))
      .limit(1);
    return row ?? null;
  }

  async function nextId(type: TicketType): Promise<string> {
    const [row] = await db
      .select({ max: sql<number | null>`max(cast(substr(${ticketsTable.id}, 5) as integer))` })
      .from(ticketsTable)
      .where(sql`${ticketsTable.id} like ${`${type}-%`}`);
    return `${type}-${(row?.max ?? FIRST_NUMBER[type]) + 1}`;
  }

  async function listForUser(userEmail: string, filter: { onlyActive?: boolean } = {}): Promise<TicketView[]> {
    const email = normalizeEmail(userEmail);
    const at = clock();
    const rows = await legacy("listForUser", () =>
      db
        .select()
        .from(ticketsTable)
        .where(eq(ticketsTable.requesterEmail, email))
        .orderBy(desc(ticketsTable.lastUpdatedAt)),
    );
    return rows.filter((r) => !filter.onlyActive || isActiveStatus(r.status)).map((r) => toView(r, at));
  }

  /** `null` tanto para "não existe" quanto para "é de outra pessoa". */
  async function getForUser(userEmail: string, ticketId: string): Promise<TicketView | null> {
    const email = normalizeEmail(userEmail);
    const at = clock();
    const ticket = await legacy("getForUser", () => fetchOwned(email, ticketId));
    return ticket ? toView(ticket, at) : null;
  }

  async function createTicket(
    userEmail: string,
    input: TicketDraft,
    opts: { ignoreDuplicates?: boolean } = {},
  ): Promise<CreateResult> {
    const draft = ticketDraftSchema.parse(input); // última barreira: o agent não grava rascunho inválido
    const email = normalizeEmail(userEmail);
    const at = clock();

    if (!opts.ignoreDuplicates) {
      const mine = await listForUser(email);
      const candidates = findDuplicates(draft, mine, at);
      if (candidates.length > 0) return { status: "duplicate", candidates };
    }

    const created = await legacy("createTicket", async () => {
      for (let attempt = 1; ; attempt++) {
        const id = await nextId(draft.type);
        try {
          const [row] = await db
            .insert(ticketsTable)
            .values({
              id,
              requesterEmail: email,
              ...draft,
              status: "open",
              createdAt: at,
              lastUpdatedAt: at,
              resolvedAt: null,
            })
            .returning();
          if (!row) throw new Error("O insert não retornou o chamado criado.");
          return row;
        } catch (err) {
          // Duas criações simultâneas podem calcular o mesmo número: tenta de novo.
          if (attempt >= 3 || !isUniqueViolation(err)) throw err;
        }
      }
    });

    return { status: "created", ticket: toView(created, at) };
  }

  /**
   * Complementa um chamado. Se estiver resolvido há até 7 dias, reabre.
   * Atualização do funcionário NÃO reinicia o prazo; só a reabertura reinicia.
   */
  async function addUpdate(userEmail: string, ticketId: string, note: string): Promise<UpdateResult> {
    const email = normalizeEmail(userEmail);
    const text = noteSchema.parse(note);
    const at = clock();

    return legacy<UpdateResult>("addUpdate", async () => {
      const ticket = await fetchOwned(email, ticketId);
      if (!ticket) return { status: "not_found" };
      if (ticket.status === "closed") return { status: "closed" };

      const insertNote = (prefix = "") =>
        db.insert(ticketUpdates).values({ ticketId: ticket.id, authorEmail: email, note: prefix + text, createdAt: at });

      if (ticket.status === "resolved") {
        if (!canReopen(ticket, at)) return { status: "cannot_reopen" };
        await db.batch([
          insertNote("Reaberto pelo funcionário: "),
          db
            .update(ticketsTable)
            .set({ status: "open", lastUpdatedAt: at, resolvedAt: null })
            .where(eq(ticketsTable.id, ticket.id)),
        ]);
        return {
          status: "reopened",
          ticket: toView({ ...ticket, status: "open", lastUpdatedAt: at, resolvedAt: null }, at),
        };
      }

      await insertNote();
      return { status: "updated", ticket: toView(ticket, at) };
    });
  }

  /** Marca o chamado como aguardando analista. O prazo continua correndo. */
  async function escalate(userEmail: string, ticketId: string, reason: string): Promise<EscalateResult> {
    const email = normalizeEmail(userEmail);
    const at = clock();

    return legacy<EscalateResult>("escalate", async () => {
      const ticket = await fetchOwned(email, ticketId);
      if (!ticket) return { status: "not_found" };
      if (!isActiveStatus(ticket.status)) return { status: "not_active" };
      if (ticket.status === "awaiting_analyst") return { status: "escalated", ticket: toView(ticket, at) };

      await db.batch([
        db.insert(ticketUpdates).values({
          ticketId: ticket.id,
          authorEmail: email,
          note: `Escalado para analista: ${reason}`,
          createdAt: at,
        }),
        db.update(ticketsTable).set({ status: "awaiting_analyst" }).where(eq(ticketsTable.id, ticket.id)),
      ]);
      return { status: "escalated", ticket: toView({ ...ticket, status: "awaiting_analyst" }, at) };
    });
  }

  /** Console do analista: vê os chamados de qualquer funcionário, mas só se for analista. */
  async function listAsAnalyst(analystEmail: string, employeeEmail: string): Promise<TicketView[]> {
    await users.requireAnalyst(analystEmail);
    return listForUser(employeeEmail);
  }

  return { listForUser, getForUser, createTicket, addUpdate, escalate, listAsAnalyst };
}

export type TicketService = ReturnType<typeof createTicketService>;