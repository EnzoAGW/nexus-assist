"use client";

import { useEffect, type KeyboardEvent, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/cx";

interface Props {
    value: string;
    onChange(value: string): void;
    onSend(): void;
    disabled: boolean;
    sending: boolean;
    placeholder: string;
    used: number;
    limit: number;
    inputRef: RefObject<HTMLTextAreaElement | null>;
}

export function Composer({ value, onChange, onSend, disabled, sending, placeholder, used, limit, inputRef }: Props) {
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [value, inputRef]);

    const canSend = !disabled && value.trim().length > 0;
    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSend) onSend();
        }
    };

    return (
        <form onSubmit={(e) => { e.preventDefault(); if (canSend) onSend(); }} className="mx-auto w-full max-w-3xl">
            <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-2 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/20">
                <textarea
                    ref={inputRef}
                    rows={1}
                    maxLength={2000}
                    value={value}
                    disabled={disabled}
                    placeholder={placeholder}
                    aria-label="Mensagem para o Nexo Assist"
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                />
                <Button type="submit" loading={sending} disabled={!canSend} className="h-9">Enviar</Button>
            </div>
            <p className="mt-1.5 flex justify-between gap-3 text-xs text-slate-500">
                <span>Enter envia · Shift+Enter quebra a linha</span>
                <span aria-live="polite" className={cx(used >= limit ? "font-medium text-red-600" : used >= limit - 5 && "text-amber-600")}>
                    {used}/{limit} mensagens nesta sessão
                </span>
            </p>
        </form>
    );
}