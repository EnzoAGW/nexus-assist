"use client";

import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";

export function ReplyBar({ onSend, disabled, sending }: { onSend(text: string): Promise<boolean>; disabled: boolean; sending: boolean }) {
    const [text, setText] = useState("");

    async function submit() {
        const clean = text.trim();
        if (!clean || disabled) return;
        if (await onSend(clean)) setText(""); // só limpa se o envio deu certo
    }
    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
        }
    };

    return (
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="border-t border-slate-200 p-3">
            <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-2 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/20">
                <textarea
                    rows={2}
                    maxLength={2000}
                    value={text}
                    disabled={disabled}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Responda ao funcionário…"
                    aria-label="Resposta ao funcionário"
                    className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-slate-400"
                />
                <Button type="submit" loading={sending} disabled={disabled || text.trim().length === 0} className="h-9">Enviar</Button>
            </div>
            <p className="mt-1 text-xs text-slate-500">Enter envia · Shift+Enter quebra a linha</p>
        </form>
    );
}