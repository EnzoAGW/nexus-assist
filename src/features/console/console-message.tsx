"use client";

import { useId, useState } from "react";
import { ActionChips } from "@/features/chat/action-chips";
import { DecisionPanel } from "@/features/chat/decision-panel";
import { RichText } from "@/features/chat/rich-text";
import { describeUi } from "@/lib/client/console-rules";
import { clockTime } from "@/lib/client/time";
import { cx } from "@/lib/cx";
import { parseUi } from "@/lib/domain/model/ui";
import type { MessageDto } from "@/server/serialize";

export function ConsoleMessage({ message, label }: { message: MessageDto; label: string }) {
    const [open, setOpen] = useState(false);
    const panelId = useId();

    if (message.role === "system") {
        return (
            <div className="flex justify-center">
                <p className="max-w-[90%] rounded-full bg-slate-100 px-3 py-1 text-center text-xs text-slate-600">{message.content}</p>
            </div>
        );
    }

    const isAgent = message.role === "agent";
    const isAnalyst = message.role === "analyst";

    return (
        <div className={cx("flex flex-col", isAnalyst ? "items-end" : "items-start")}>
            <p className="mb-1 text-xs font-medium text-slate-500">
                {label} <span className="font-normal text-slate-400">· {clockTime(message.createdAt)}</span>
            </p>
            {isAgent && message.trace && <ActionChips actions={message.trace.actions} />}
            <div
                className={cx(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                    isAnalyst && "rounded-br-sm bg-brand-600 text-white",
                    isAgent && "rounded-bl-sm border border-slate-200 bg-white",
                    message.role === "user" && "rounded-bl-sm bg-slate-100 text-slate-900",
                )}
            >
                {isAgent ? <RichText text={message.content} /> : <p className="whitespace-pre-wrap break-words">{message.content}</p>}
            </div>
            {isAgent &&
                parseUi(message.ui).map((el, i) => (
                    <p key={i} className="mt-1 text-xs italic text-slate-500">{describeUi(el)}</p>
                ))}
            {isAgent && message.trace && (
                <>
                    <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)} className="mt-1.5 text-xs font-medium text-slate-500 hover:text-brand-700">
                        {open ? "Ocultar detalhes da decisão" : "Ver detalhes da decisão"}
                    </button>
                    {open && <DecisionPanel id={panelId} trace={message.trace} />}
                </>
            )}
        </div>
    );
}