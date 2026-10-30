import { cx } from "@/lib/cx";
import type { TicketStatus } from "@/lib/domain/model/enums";
import { formatDateTime } from "@/lib/domain/utils/format";
import type { TicketDto } from "@/server/serialize";

const STATUS_TONE: Record<TicketStatus, string> = {
    open: "bg-blue-50 text-blue-700",
    in_progress: "bg-blue-50 text-blue-700",
    awaiting_analyst: "bg-amber-50 text-amber-800",
    approved: "bg-emerald-50 text-emerald-700",
    resolved: "bg-emerald-50 text-emerald-700",
    closed: "bg-slate-100 text-slate-600",
};

export const TYPE_LABEL = { INC: "Incidente", REQ: "Requisição" } as const;

export function StatusChip({ ticket }: { ticket: TicketDto }) {
    return <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[ticket.status])}>{ticket.statusLabel}</span>;
}

const fmt = (iso: string) => formatDateTime(new Date(iso));

export function TicketCard({ ticketId, tickets }: { ticketId: string; tickets: TicketDto[] | null }) {
    const ticket = tickets?.find((t) => t.id === ticketId);
    if (!ticket) {
        return (
            <div className="mt-2 w-full max-w-md rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-500">
                {ticketId}: dados indisponíveis no momento.
            </div>
        );
    }

    return (
        <article aria-label={`Chamado ${ticket.id}`} className="mt-2 w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-slate-500">{ticket.id}</span>
                <div className="flex items-center gap-1.5">
                    {ticket.overdue && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">Prazo vencido</span>}
                    <StatusChip ticket={ticket} />
                </div>
            </div>
            <h3 className="mt-2 text-sm font-semibold">{ticket.title}</h3>
            <p className="mt-1 line-clamp-2 text-xs text-slate-600">{ticket.description}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div><dt className="text-slate-500">Categoria</dt><dd className="font-medium">{ticket.category}</dd></div>
                <div><dt className="text-slate-500">Prioridade</dt><dd className="font-medium">{ticket.priorityLabel}</dd></div>
                <div><dt className="text-slate-500">Aberto em</dt><dd className="font-medium">{fmt(ticket.createdAt)}</dd></div>
                <div><dt className="text-slate-500">Última atualização</dt><dd className="font-medium">{fmt(ticket.lastUpdatedAt)}</dd></div>
                {ticket.status !== "resolved" && ticket.status !== "closed" && (
                    <div className="col-span-2">
                        <dt className="text-slate-500">Prazo de resposta</dt>
                        <dd className={cx("font-medium", ticket.overdue && "text-red-700")}>{fmt(ticket.dueAt)}</dd>
                    </div>
                )}
            </dl>
        </article>
    );
}