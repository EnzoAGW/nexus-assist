"use client";

import { useState } from "react";
import { StatusChip, TicketCard } from "@/features/chat/ticket-card";
import { pickFocusTicket } from "@/lib/client/console-rules";
import { cx } from "@/lib/cx";
import type { TicketDto } from "@/server/serialize";

export function TicketsPanel({ employeeName, tickets, hints, onClose }: { employeeName: string; tickets: TicketDto[] | null; hints: string[]; onClose(): void }) {
    const [manual, setManual] = useState<string | null>(null);
    const firstName = employeeName.split(" ")[0];

    const focus = tickets ? (tickets.find((t) => t.id === manual) ?? pickFocusTicket(tickets, hints)) : null;
    const others = tickets?.filter((t) => t.id !== focus?.id) ?? [];
    const overdue = tickets?.filter((t) => t.overdue).length ?? 0;

    return (
        <aside aria-label={`Chamados de ${firstName}`} className="flex h-full w-80 flex-col overflow-y-auto border-l border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h2 className="text-sm font-semibold">Chamados de {firstName}</h2>
                    {tickets && <p className="text-xs text-slate-500">{tickets.length} chamado(s){overdue > 0 ? ` · ${overdue} vencido(s)` : ""}</p>}
                </div>
                <button type="button" onClick={onClose} aria-label="Fechar painel" className="rounded px-2 text-slate-500 hover:bg-slate-100 xl:hidden">✕</button>
            </div>

            {tickets === null && (
                <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">O sistema de chamados está instável agora. Tente de novo em instantes.</p>
            )}
            {tickets && tickets.length === 0 && <p className="mt-4 text-sm text-slate-500">Este funcionário ainda não tem chamados.</p>}

            {focus && tickets && (
                <section className="mt-4">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Em foco</h3>
                    <TicketCard ticketId={focus.id} tickets={tickets} />
                </section>
            )}

            {others.length > 0 && (
                <section className="mt-5">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Outros chamados</h3>
                    <ul className="mt-2 space-y-1.5">
                        {others.map((t) => (
                            <li key={t.id}>
                                <button type="button" onClick={() => setManual(t.id)} className={cx("flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand-600")}>
                                    <span className="font-mono text-xs text-slate-500">{t.id}</span>
                                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                                    {t.overdue && <span aria-label="Prazo vencido" className="size-2 shrink-0 rounded-full bg-red-500" />}
                                    <StatusChip ticket={t} />
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </aside>
    );
}