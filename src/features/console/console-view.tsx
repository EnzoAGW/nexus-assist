"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { useDebounced, useLiveResource, useNow } from "./hooks";
import { TicketsPanel } from "./tickets-panel";

const LIST_POLL_MS = 5000;
const DETAIL_POLL_MS = 4000;

export function ConsoleView() {
    const router = useRouter();
    const now = useNow();

    const [filter, setFilter] = useState<ConsoleFilter>("all");
    const [query, setQuery] = useState("");
    const debouncedQuery = useDebounced(query.trim(), 300);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [busy, setBusy] = useState<Busy>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [ticketsOpen, setTicketsOpen] = useState(false);
    const [availabilityOverride, setAvailabilityOverride] = useState<boolean | null>(null);

    // Lista: mantém a anterior na tela enquanto a nova (outra aba ou busca) carrega.
    const listRes = useLiveResource<ConsoleList>({
        key: JSON.stringify([filter, debouncedQuery]),
        fetcher: () => fetchList({ filter, query: debouncedQuery }),
        intervalMs: LIST_POLL_MS,
        keepPrevious: true,
    });
    // Conversa: a chave é o id, então nunca mostra a anterior; não consulta enquanto uma ação está em curso.
    const detailRes = useLiveResource<ConsoleDetailResponse>({
        key: selectedId,
        fetcher: fetchDetail,
        intervalMs: DETAIL_POLL_MS,
        pollEnabled: busy === null,
    });

    const sessionExpired = listRes.error instanceof SessionExpiredError || detailRes.error instanceof SessionExpiredError;
    useEffect(() => {
        if (sessionExpired) router.replace("/login");
    }, [sessionExpired, router]);

    const waiting = listRes.data?.counts.waiting ?? 0;
    useEffect(() => {
        document.title = `${waiting > 0 ? `(${waiting}) ` : ""}Console · Nexo Assist`;
    }, [waiting]);

    // Tudo abaixo é derivado: nenhum estado é copiado nem sincronizado por efeito.
    const list: ConsoleList | null =
        listRes.data && availabilityOverride !== null
            ? { ...listRes.data, me: { ...listRes.data.me, available: availabilityOverride } }
            : listRes.data;
    const listError = listRes.error && !sessionExpired ? friendlyError(listRes.error) : null;

    const detail = detailRes.data;
    const detailGone = detailRes.error instanceof ConsoleApiError && detailRes.error.status === 404;
    const detailError = !detail && detailRes.error && !detailGone && !sessionExpired ? friendlyError(detailRes.error) : null;
    const meEmail = list?.me.email ?? null;

    const fail = (err: unknown) => {
        if (err instanceof SessionExpiredError) router.replace("/login");
        else setNotice(friendlyError(err));
    };

    const select = (id: string) => {
        if (id === selectedId) return;
        setSelectedId(id);
        setNotice(null);
        setTicketsOpen(false);
    };
    const back = () => setSelectedId(null);

    async function act(action: Action) {
        if (!selectedId || busy) return;
        setBusy(action);
        setNotice(null);
        try {
            await runAction(selectedId, action);
        } catch (err) {
            fail(err); // inclui 409: outro analista foi mais rápido
        } finally {
            await Promise.all([detailRes.reload(), listRes.reload()]);
            setBusy(null);
        }
    }

    async function reply(text: string): Promise<boolean> {
        if (!selectedId || busy) return false;
        setBusy("reply");
        setNotice(null);
        try {
            await postReply(selectedId, text);
            await detailRes.reload();
            return true;
        } catch (err) {
            fail(err);
            await detailRes.reload();
            return false;
        } finally {
            setBusy(null);
        }
    }

    async function toggleAvailability(next: boolean) {
        setAvailabilityOverride(next); // otimista; cai quando o servidor confirmar (ou falhar)
        try {
            await setAvailability(next);
            await listRes.reload();
        } catch (err) {
            fail(err);
        } finally {
            setAvailabilityOverride(null);
        }
    }

    return (
        <div className="relative flex h-dvh">
            <section aria-label="Lista de conversas" className={cx("w-full border-r border-slate-200 bg-white lg:w-[22rem] lg:shrink-0", selectedId && "hidden lg:block")}>
                <ConversationList
                    list={list} error={listError} filter={filter} onFilter={setFilter} query={query} onQuery={setQuery}
                    selectedId={selectedId} onSelect={select} onAvailability={(v) => void toggleAvailability(v)}
                    onRetry={() => void listRes.reload()} now={now}
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

                {selectedId && detailGone && (
                    <div className="grid flex-1 place-items-center p-8 text-center">
                        <div>
                            <p className="text-sm text-slate-700">Essa conversa não existe mais.</p>
                            <Button variant="secondary" className="mt-3" onClick={back}>Voltar à lista</Button>
                        </div>
                    </div>
                )}

                {selectedId && !detail && !detailError && !detailGone && (
                    <p role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500"><Spinner /> Abrindo conversa…</p>
                )}
                {selectedId && !detail && detailError && (
                    <div className="grid flex-1 place-items-center text-center">
                        <div>
                            <p className="text-sm text-slate-700">{detailError}</p>
                            <Button variant="secondary" className="mt-3" onClick={() => void detailRes.reload()}>Tentar de novo</Button>
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