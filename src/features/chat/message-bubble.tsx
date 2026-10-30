"use client";

import { useId, useState } from "react";
import { cx } from "@/lib/cx";
import { parseUi, type UiElement } from "@/lib/domain/model/ui";
import type { MessageDto } from "@/server/serialize";
import { ActionChips } from "./action-chips";
import { DecisionPanel } from "./decision-panel";
import { DraftCard, UpdateDraftCard } from "./draft-card";
import { QuickReplies } from "./quick-replies";
import { RichText } from "./rich-text";
import { TicketCard } from "./ticket-card";
import { TicketPicker } from "./ticket-picker";
import type { BubbleContext } from "./types";

function Element({ el, message, ctx }: { el: UiElement; message: MessageDto; ctx: BubbleContext }) {
    const interactive = ctx.interactiveId === message.id && !ctx.busy;
    const draftActions = { active: ctx.activeDraftId === message.id, busy: ctx.busy, onConfirm: ctx.handlers.onConfirm, onEdit: ctx.handlers.onEdit, onCancel: ctx.handlers.onCancel };

    switch (el.type) {
        case "quick_replies":
            return <QuickReplies options={el.options} enabled={interactive} onPick={ctx.handlers.onQuickReply} />;
        case "ticket_list":
            return <TicketPicker ids={el.ticketIds} tickets={ctx.tickets} enabled={interactive} onPick={ctx.handlers.onPickTicket} />;
        case "ticket_card":
            return <TicketCard ticketId={el.ticketId} tickets={ctx.tickets} />;
        case "draft":
            return <DraftCard draft={el.draft} dueAt={el.dueAt} priorityReason={el.priorityReason} {...draftActions} />;
        case "update_draft":
            return <UpdateDraftCard ticketId={el.ticketId} note={el.note} reopen={el.reopen} {...draftActions} />;
    }
}

export function MessageBubble({ message, ctx }: { message: MessageDto; ctx: BubbleContext }) {
    const [open, setOpen] = useState(false);
    const panelId = useId();

    if (message.role === "system") {
        return (
            <div className="flex justify-center">
                <p className="max-w-[90%] rounded-full bg-slate-100 px-3 py-1 text-center text-xs text-slate-600">{message.content}</p>
            </div>
        );
    }

    if (message.role === "user") {
        return (
            <div className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-night-900 px-4 py-2.5 text-sm text-white">{message.content}</p>
            </div>
        );
    }

    const isAgent = message.role === "agent";
    return (
        <div className="flex max-w-[92%] flex-col items-start sm:max-w-[85%]">
            <p className="mb-1 text-xs font-medium text-slate-500">{isAgent ? "Nexo Assist" : "Analista do service desk"}</p>
            {message.trace && <ActionChips actions={message.trace.actions} />}
            <div className={cx("rounded-2xl rounded-bl-sm px-4 py-2.5", isAgent ? "border border-slate-200 bg-white" : "bg-brand-50 text-brand-700")}>
                <RichText text={message.content} />
            </div>
            {parseUi(message.ui).map((el, i) => (
                <Element key={i} el={el} message={message} ctx={ctx} />
            ))}
            {message.trace && (
                <>
                    <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={panelId}
                        onClick={() => setOpen((v) => !v)}
                        className="mt-1.5 text-xs font-medium text-slate-500 hover:text-brand-700"
                    >
                        {open ? "Ocultar detalhes da decisão" : "Ver detalhes da decisão"}
                    </button>
                    {open && <DecisionPanel id={panelId} trace={message.trace} />}
                </>
            )}
        </div>
    );
}