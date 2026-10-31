"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SessionExpiredError } from "@/lib/client/chat-api";
import {
    ConsoleApiError, fetchDetail, fetchList, friendlyError, postReply, runAction, setAvailability,
    type ConsoleDetailResponse, type ConsoleList,
} from "@/lib/client/console-api";
import { cx } from "@/lib/cx";
import type { ConsoleFilter } from "@/lib/domain/model/console";
import { ConversationList } from "./conversation-list";
import { ConversationPanel, type Action, type Busy } from "./conversation-panel";
import { useDebounced, useNow, usePolling } from "./hooks";
import { TicketsPanel } from "./tickets-panel";

const LIST_POLL_MS = 5000;
const DETAIL_POLL_MS = 4000;

export function ConsoleView() {
    const router = useRouter();
    const now = useNow();

    const [filter, setFilter] = useState<ConsoleFilter>("all");
    const [query, setQuery] = useState("");
    const debouncedQuery = useDebounced(query.trim(), 300);

    const [list, setList] = useState<ConsoleList | null>(null);
    const [listError, setListError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<ConsoleDetailResponse | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [busy, setBusy] = useState<Busy>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [ticketsOpen, setTicketsOpen] = useState(false);

    // Cada consulta tem um número: resposta de uma consulta antiga nunca sobrescreve a mais nova.
    const listSeq = useRef(0);
    const detailSeq = useRef(0);

    const fail = useCallback(
        (err: unknown, show: (message: string | null) => void) => {
            if (err instanceof SessionExpiredError) router.replace("/login");
            else show(friendlyError(err));
        },
        [router],
    );

    const loadList = useCallback(async () => {
        const seq = ++listSeq.current;
        try {
            const data = await fetchList({ filter, query: debouncedQuery });
            if (seq !== listSeq.current) return;
            setList(data);
            setListError(null);
        } catch (err) {
            if (seq === listSeq.current) fail(err, setListError);
        }
    }, [filter, debouncedQuery, fail]);

    const loadDetail = useCallback(
        async (id: string) => {
            const seq = ++detailSeq.current;
            try {
                const data = await fetchDetail(id);
                if (seq !== detailSeq.current) return;
                setDetail(data);
                setDetailError(null);
            } catch (err) {
                if (seq !== detailSeq.current) return;
                if (err instanceof ConsoleApiError && err.status === 404) {
                    setSelectedId(null);
                    setDetail(null);
                    setNotice("Essa conversa não existe mais.");
                    return;
                }
                fail(err, setDetailError);
            }
        },
        [fail],
    );

    useEffect(() => {
        void loadList();
    }, [loadList]);
    usePolling(loadList, LIST_POLL_MS, true);

    useEffect(() => {
        if (selectedId) void loadDetail(selectedId);
    }, [selectedId, loadDetail]);
    usePolling(() => (selectedId ? loadDetail(selectedId) : undefined), DETAIL_POLL_MS, selectedId !== null && busy === null);

    const waiting = list?.counts.waiting ?? 0;
    useEffect(() => {
        document.title = `${waiting > 0 ? `(${waiting}) ` : ""}Console · Nexo Assist`;
    }, [waiting]);

    const select = (id: string) => {
        if (id === selectedId) return;
        detailSeq.current++;
        setSelectedId(id);
        setDetail(null);
        setDetailError(null);
        setNotice(null);
        setTicketsOpen(false);
    };

    const back = () => {
        detailSeq.current++;
        setSelectedId(null);
        setDetail(null);
    };

    const act = useCallback(
        async (action: Action) => {
            if (!selectedId || busy) return;
            setBusy(action);
            setNotice(null);
            try {
                await runAction(selectedId, action);
            } catch (err) {
                fail(err, setNotice); // inclui 409: outro analista foi mais rápido
            } finally {
                await Promise.all([loadDetail(selectedId), loadList()]);
                setBusy(null);
            }
        },
        [selectedId, busy, fail, loadDetail, loadList],
    );

    const reply = useCallback(
        async (text: string): Promise<boolean> => {
            if (!selectedId || busy) return false;
            setBusy("reply");
            setNotice(null);
            try {
                await postReply(selectedId, text);
                await loadDetail(selectedId);
                return true;
            } catch (err) {
                fail(err, setNotice);
                await loadDetail(selectedId);
                return false;
            } finally {
                setBusy(null);
            }
        },
        [selectedId, busy, fail, loadDetail],
    );

    const toggleAvailability = useCallback(
        async (available: boolean) => {
            const apply = (value: boolean) => setList((l) => (l ? { ...l, me: { ...l.me, available: value } } : l));
            apply(available); // otimista
            try {
                await setAvailability(available);
            } catch (err) {
                apply(!available);
                fail(err, setNotice);
            }
        },
        [fail],
    );

    const meEmail = list?.me.email ?? null;

    return (
        <div className="relative flex h-dvh">
            <section aria-label="Lista de conversas" className={cx("w-full border-r border-slate-200 bg-white lg:w-[22rem] lg:shrink-0", selectedId && "hidden lg:block")}>
                <ConversationList
                    list={list} error={listError} filter={filter} onFilter={setFilter} query={query} onQuery={setQuery}
                    selectedId={selectedId} onSelect={select} onAvailability={(v) => void toggleAvailability(v)}
                    onRetry={() => void loadList()} now={now}
                />
            </section>

            <section aria-label="Conversa" className={cx("min-w-0 flex-1 flex-col bg-white", selectedId ? "flex" : "hidden lg:flex")}>
                {notice && (
                    <div role="alert" className="flex items-center justify-between gap-3 bg-red-50 px-4 py-2 text-sm text-red-800 ring-1 ring-red-200">
                        <p>{notice}</p>
                        <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-xs font-medium hover:underline">Fechar</button>
                    </div>
                )}

                {!selectedId && (
                    <div className="grid flex-1 place-items-center p-8 text-center">
                        <div>
                            <h2 className="text-lg font-semibold">Selecione uma conversa</h2>
                            <p className="mt-1 text-sm text-slate-500">
                                {waiting > 0 ? `${waiting} ${waiting === 1 ? "conversa espera" : "conversas esperam"} atendimento.` : "Ninguém está esperando atendimento agora."}
                            </p>
                        </div>
                    </div>
                )}

                {selectedId && !detail && !detailError && (
                    <p role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500"><Spinner /> Abrindo conversa…</p>
                )}
                {selectedId && !detail && detailError && (
                    <div className="grid flex-1 place-items-center text-center">
                        <div>
                            <p className="text-sm text-slate-700">{detailError}</p>
                            <Button variant="secondary" className="mt-3" onClick={() => void loadDetail(selectedId)}>Tentar de novo</Button>
                        </div>
                    </div>
                )}

                {detail && meEmail && (
                    <div className="relative flex min-h-0 flex-1">
                        <ConversationPanel
                            key={detail.conversation.id}
                            detail={detail} meEmail={meEmail} now={now} busy={busy}
                            onAction={(a) => void act(a)} onReply={reply} onBack={back}
                            onToggleTickets={() => setTicketsOpen((v) => !v)}
                        />
                        <div className={cx("shrink-0", ticketsOpen ? "absolute inset-y-0 right-0 z-10 shadow-xl xl:static xl:shadow-none" : "hidden xl:block")}>
                            <TicketsPanel
                                key={detail.conversation.id}
                                employeeName={detail.employee.name}
                                tickets={detail.tickets}
                                hints={[detail.conversation.handoffSummary ?? "", ...detail.messages.map((m) => m.content)]}
                                onClose={() => setTicketsOpen(false)}
                            />
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}