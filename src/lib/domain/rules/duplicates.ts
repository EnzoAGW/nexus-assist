import type { TicketStatus } from "../model/enums";
import { isActiveStatus } from "./sla";
import { tokenize } from "../utils/text";
import { canReopen } from "./ticket-rules";

export const DUPLICATE_THRESHOLD = 0.6;
export const MIN_SHARED_TOKENS = 2;

export interface DedupeSubject {
  id: string;
  title: string;
  status: TicketStatus;
  resolvedAt: Date | null;
}

export type DuplicateAction = "update" | "reopen";

export interface DuplicateCandidate<T extends DedupeSubject = DedupeSubject> {
  ticket: T;
  /** 0 a 1. */
  score: number;
  /** Ativo → atualizar. Resolvido há até 7 dias → reabrir. */
  action: DuplicateAction;
}

export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  const shared = [...ta].filter((t) => tb.has(t)).length;
  const smallest = Math.min(ta.size, tb.size);
  if (smallest === 0 || shared < MIN_SHARED_TOKENS) return 0;
  return shared / smallest;
}

export function findDuplicates<T extends DedupeSubject>(
  draft: { title: string },
  tickets: readonly T[],
  now: Date,
): DuplicateCandidate<T>[] {
  const found: DuplicateCandidate<T>[] = [];

  for (const ticket of tickets) {
    const action: DuplicateAction | null = isActiveStatus(ticket.status)
      ? "update"
      : canReopen(ticket, now)
        ? "reopen"
        : null; // resolvido há mais de 7 dias ou encerrado: não é duplicata
    if (!action) continue;

    const score = titleSimilarity(draft.title, ticket.title);
    if (score >= DUPLICATE_THRESHOLD) found.push({ ticket, score, action });
  }

  return found.sort((a, b) => b.score - a.score);
}