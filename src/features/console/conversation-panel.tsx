"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ConsoleDetailResponse } from "@/lib/client/console-api";
import { availableActions, consoleMode, itemStatus } from "@/lib/client/console-rules";
import { initials } from "@/lib/client/format";
import { relativeTime } from "@/lib/client/time";
import { cx } from "@/lib/cx";
import type { MessageDto } from "@/server/serialize";
import { ConsoleMessage } from "./console-message";
import { HandoffSummary } from "./handoff-summary";
import { useStickyScroll } from "./hooks";
import { ReplyBar } from "./reply-bar";
import { TONE_PILL } from "./tones";

export type Action = "claim" | "return" | "close";
export type Busy = Action | "reply" | null;

interface Props {
    detail: ConsoleDetailResponse;
    meEmail: string;
    now: Date;
    busy: Busy;
    onAction(action: Action): void;
    onReply(text: string): Promise<boolean>;
    onBack(): void;
    onToggleTickets(): void;
}

export function ConversationPanel({ detail, meEmail, now, busy, onAction, onReply, onBack, onToggleTickets }: Props) {
    const { conversation, employee, messages } = detail;
    const [confirmingClose, setConfirmingClose] = useState(false);
    const { scroller, end, onScroll } = useStickyScroll(messages.length);

    const mode = consoleMode(conversation, meEmail);
    const can = availableActions(conversation, meEmail);
    const status = itemStatus(conversation, meEmail);
    const firstName = employee.name.split(" ")[0];

    const labelFor = (m: MessageDto): string => {
        if (m.role === "user") return employee.name;
        if (m.role === "agent") return "Nexo Assist";
        if (m.authorEmail === meEmail) return "Você";
        if (m.authorEmail && m.authorEmail === conversation.assignedAnalystEmail) return conversation.assignedAnalystName ?? "Analista";
        return "Analista";
    };

    return (
        <div className="flex h-full min-w-0 flex-1 flex-col">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                    <button type="button" onClick={onBack} aria-label="Voltar para a lista" className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100 lg:hidden">←</button>
                    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">{initials(employee.name)}</span>
                    <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold">{employee.name}</h2>
                        <p className="truncate text-xs text-slate-500">{employee.email}</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <span className={cx("rounded-full px-2.5 py-1 text-xs font-medium ring-1", TONE_PILL[status.tone])}>{status.label}</span>
                    <Button variant="secondary" onClick={onToggleTickets} className="h-8 xl:hidden">Chamados</Button>
                    {mode === "mine" && can.returnToAgent && (
                        <Button variant="secondary" loading={busy === "return"} disabled={busy !== null} onClick={() => onAction("return")} className="h-8">Devolver ao agent</Button>
                    )}
                    {can.close &&
                        (confirmingClose ? (
                            <span className="flex items-center gap-1.5 text-xs">
                                <span className="text-slate-600">Encerrar de vez?</span>
                                <Button loading={busy === "close"} disabled={busy !== null} onClick={() => { setConfirmingClose(false); onAction("close"); }} className="h-8 bg-red-600 hover:bg-red-700">Sim, encerrar</Button>
                                <Button variant="ghost" onClick={() => setConfirmingClose(false)} className="h-8">Cancelar</Button>
                            </span>
                        ) : (
                            <Button variant="secondary" disabled={busy !== null} onClick={() => setConfirmingClose(true)} className="h-8 border-red-200 text-red-700 hover:bg-red-50">Encerrar atendimento</Button>
                        ))}
                </div>
            </header>

            <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-5 sm:px-6">
                <div role="log" aria-label={`Conversa com ${employee.name}`} className="mx-auto flex max-w-3xl flex-col gap-4">
                    <HandoffSummary kind={conversation.handoffKind} kindLabel={conversation.handoffKindLabel} reason={conversation.handoffReason} summary={conversation.handoffSummary} />
                    {messages.length === 0 && <p className="text-center text-sm text-slate-500">Nenhuma mensagem nesta conversa.</p>}
                    {messages.map((m) => (
                        <ConsoleMessage key={m.id} message={m} label={labelFor(m)} />
                    ))}
                    <div ref={end} />
                </div>
            </div>

            {mode === "waiting" && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm text-amber-900">
                        <strong>{firstName}</strong> espera um atendente · agent pausado · {relativeTime(conversation.updatedAt, now)}
                    </p>
                    <div className="flex gap-2">
                        <Button variant="secondary" loading={busy === "return"} disabled={busy !== null} onClick={() => onAction("return")}>Devolver ao agent</Button>
                        <Button loading={busy === "claim"} disabled={busy !== null} onClick={() => onAction("claim")}>Assumir atendimento</Button>
                    </div>
                </div>
            )}
            {mode === "mine" && <ReplyBar onSend={onReply} disabled={busy !== null} sending={busy === "reply"} />}
            {mode === "other" && <p role="status" className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">Esta conversa está com <strong>{conversation.assignedAnalystName ?? "outro analista"}</strong>. Você pode acompanhar, mas não responder.</p>}
            {mode === "agent" && <p role="status" className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">O agent está atendendo esta conversa. Se ele transferir, ela entra na fila.</p>}
            {mode === "closed" && <p role="status" className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">Atendimento encerrado.</p>}
        </div>
    );
}