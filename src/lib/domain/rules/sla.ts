import { addBusinessHours, BUSINESS_HOURS_PER_DAY } from "../utils/business-time";
import type { Priority, TicketStatus } from "../model/enums";

const HOUR_MS = 60 * 60 * 1000;

/** Críticos têm plantão 24h: prazo em horas corridas. Os demais, em horas úteis. */
const SLA: Record<Priority, { hours: number; businessTime: boolean }> = {
  critical: { hours: 1, businessTime: false },
  high: { hours: 4, businessTime: true },
  medium: { hours: 3 * BUSINESS_HOURS_PER_DAY, businessTime: true }, // 3 dias úteis
  low: { hours: 5 * BUSINESS_HOURS_PER_DAY, businessTime: true }, // 5 dias úteis
};

/** Status em que o prazo ainda corre. */
const ACTIVE_STATUSES: readonly TicketStatus[] = ["open", "in_progress", "awaiting_analyst", "approved"];

export const isActiveStatus = (status: TicketStatus): boolean => ACTIVE_STATUSES.includes(status);

/** O prazo vale para a primeira resposta e para cada atualização: parte da última atualização. */
export function computeDueAt(priority: Priority, from: Date): Date {
  const rule = SLA[priority];
  return rule.businessTime
    ? addBusinessHours(from, rule.hours)
    : new Date(from.getTime() + rule.hours * HOUR_MS);
}

export interface SlaSubject {
  priority: Priority;
  status: TicketStatus;
  lastUpdatedAt: Date;
}

export function isOverdue(ticket: SlaSubject, now: Date): boolean {
  if (!isActiveStatus(ticket.status)) return false;
  return now.getTime() > computeDueAt(ticket.priority, ticket.lastUpdatedAt).getTime();
}