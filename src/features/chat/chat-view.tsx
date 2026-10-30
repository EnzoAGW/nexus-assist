"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { decide, fetchSnapshot, fetchTickets, SessionExpiredError, sendMessage } from "@/lib/client/chat-api";
import { activeDraftMessageId, chatReducer, initialChatState, interactiveMessageId } from "@/lib/client/chat-state";
import { cx } from "@/lib/cx";
import type { ConversationState } from "@/lib/domain/model/enums";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { StateBanner } from "./state-banner";
import type { ChatHandlers } from "./types";

const POLL_MS = 4000;
const EDIT_PREFIX = "Quero corrigir o rascunho: ";

const BADGE: Record<ConversationState, { label: string; dot: string }> = {
    with_agent: { label: "Assistente online", dot: "bg-emerald-500" },
    awaiting_analyst: { label: "Aguardando analista", dot: "bg-amber-500" },
    with_analyst: { label: "Com um analista", dot: "bg-brand-600" },
    closed: { label: "Encerrado", dot: "bg-slate-400" },
};

export function ChatView({ firstName }: { firstName: string }) {
    const router = useRouter();
    const [state, dispatch] = useReducer(chatReducer, initialChatState);
    const [composer, setComposer] = useState("");
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const lastSent = useRef("");

    const load = useCallback(
        async (kind: "loaded" | "synced") => {
            try {
                dispatch({ type: kind, snapshot: await fetchSnapshot() });
            } catch (err) {
                if (err instanceof SessionExpiredError) router.replace("/login");
                else if (kind === "loaded") dispatch({ type: "load_failed", message: "Não consegui carregar sua conversa." });
                // "synced" falhando em silêncio: a próxima consulta tenta de novo
            }
        },
        [router],
    );

    useEffect(() => {
        void load("loaded");
    }, [load]);

    // Com um analista (ou na fila), as mensagens chegam sem o funcionário fazer nada.
    useEffect(() => {
        if (state.status !== "ready" || state.conversationState === "with_agent") return;
        const id = setInterval(() => void load("synced"), POLL_MS);
        return () => clearInterval(id);
    }, [state.status, state.conversationState, load]);

    const refreshTickets = useCallback(async () => {
        try {
            dispatch({ type: "tickets", tickets: await fetchTickets() });
        } catch {
            /* os cards mostram o aviso de indisponível */
        }
    }, []);

    const send = useCallback(
        async (text: string) => {
            const clean = text.trim();
            if (!clean) return;
            lastSent.current = clean;
            setComposer("");
            const result = await sendMessage(clean, { dispatch });
            if (result === "failed") setComposer((current) => current || lastSent.current); // devolve o texto para tentar de novo
            void refreshTickets();
        },
        [refreshTickets],
    );

    const decideDraft = useCallback(
        async (decision: "confirm" | "cancel") => {
            await decide(decision, { dispatch });
            void refreshTickets();
        },
        [refreshTickets],
    );

    const handlers = useMemo<ChatHandlers>(
        () => ({
            onQuickReply: (text) => void send(text),
            // O formato "ID · título" é o que a pré-busca reconhece para abrir exatamente esse chamado.
            onPickTicket: (t) => void send(`${t.id} · ${t.title}`),
            onConfirm: () => void decideDraft("confirm"),
            onCancel: () => void decideDraft("cancel"),
            onEdit: () => {
                setComposer(EDIT_PREFIX);
                inputRef.current?.focus();
            },
        }),
        [send, decideDraft],
    );

    const busy = state.sending || state.streaming !== null;
    const limitReached = state.session.used >= state.session.limit;
    const closed = state.conversationState === "closed";
    const badge = BADGE[state.conversationState];

    const ctx = {
        tickets: state.tickets,
        activeDraftId: activeDraftMessageId(state),
        interactiveId: interactiveMessageId(state),
        busy,
        handlers,
    };

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 sm:px-8">
                <h1 className="text-sm font-semibold">Atendimento</h1>
                <p className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-600">
                    <span className={cx("size-2 rounded-full", badge.dot)} aria-hidden="true" />
                    {badge.label}
                </p>
            </div>

            <div className="min-h-0 flex-1">
                {state.status === "loading" && (
                    <div className="grid h-full place-items-center text-slate-500" role="status">
                        <span className="flex items-center gap-2 text-sm"><Spinner /> Carregando sua conversa…</span>
                    </div>
                )}
                {state.status === "error" && (
                    <div className="grid h-full place-items-center">
                        <div className="text-center">
                            <p className="text-sm text-slate-700">{state.loadError}</p>
                            <Button variant="secondary" className="mt-3" onClick={() => void load("loaded")}>Tentar de novo</Button>
                        </div>
                    </div>
                )}
                {state.status === "ready" && (
                    <MessageList
                        messages={state.messages}
                        streamingText={state.streaming?.text ?? null}
                        thinking={state.sending && state.streaming === null}
                        ctx={ctx}
                        firstName={firstName}
                    />
                )}
            </div>

            {state.status === "ready" && (
                <footer className="border-t border-slate-100 px-4 pb-4 pt-3 sm:px-8">
                    {state.tickets === null && (
                        <p role="status" className="mx-auto mb-3 max-w-3xl rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
                            O sistema de chamados está instável agora: os dados dos chamados podem aparecer incompletos.
                        </p>
                    )}
                    {state.notice && (
                        <div role="alert" className="mx-auto mb-3 flex max-w-3xl items-center justify-between gap-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800 ring-1 ring-red-200">
                            <p>{state.notice}</p>
                            <button type="button" onClick={() => dispatch({ type: "dismiss_notice" })} className="shrink-0 text-xs font-medium hover:underline">Fechar</button>
                        </div>
                    )}
                    <StateBanner state={state.conversationState} onRestart={() => void load("loaded")} />
                    <Composer
                        value={composer}
                        onChange={setComposer}
                        onSend={() => void send(composer)}
                        disabled={busy || closed || limitReached}
                        sending={busy}
                        placeholder={limitReached ? "Limite de mensagens da sessão atingido" : closed ? "Atendimento encerrado" : "Escreva sua mensagem…"}
                        used={state.session.used}
                        limit={state.session.limit}
                        inputRef={inputRef}
                    />
                </footer>
            )}
        </div>
    );
}