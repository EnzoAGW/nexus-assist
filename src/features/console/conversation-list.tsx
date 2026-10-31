"use client";

import { LogoutButton } from "@/components/logout-button";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ConsoleList } from "@/lib/client/console-api";
import { itemStatus } from "@/lib/client/console-rules";
import { initials } from "@/lib/client/format";
import { relativeTime } from "@/lib/client/time";
import { cx } from "@/lib/cx";
import { CONSOLE_FILTERS, FILTER_LABEL, type ConsoleFilter } from "@/lib/domain/model/console";
import { AvailabilityToggle } from "./availability-toggle";
import { TONE_DOT } from "./tones";

interface Props {
    list: ConsoleList | null;
    error: string | null;
    filter: ConsoleFilter;
    onFilter(f: ConsoleFilter): void;
    query: string;
    onQuery(q: string): void;
    selectedId: string | null;
    onSelect(id: string): void;
    onAvailability(next: boolean): void;
    onRetry(): void;
    now: Date;
}

export function ConversationList({ list, error, filter, onFilter, query, onQuery, selectedId, onSelect, onAvailability, onRetry, now }: Props) {
    const me = list?.me;

    return (
        <div className="flex h-full flex-col">
            <div className="space-y-3 border-b border-slate-100 px-4 pb-3 pt-4">
                <div className="flex items-center justify-between gap-2">
                    <Logo />
                    {me && <AvailabilityToggle available={me.available} onChange={onAvailability} />}
                </div>
                <h1 className="text-lg font-semibold tracking-tight">Conversas</h1>
                <input
                    type="search"
                    value={query}
                    onChange={(e) => onQuery(e.target.value)}
                    placeholder="Buscar por nome ou e-mail"
                    aria-label="Buscar conversa por nome ou e-mail"
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                />
            </div>

            <div role="tablist" aria-label="Filtros" className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 py-2">
                {CONSOLE_FILTERS.map((f) => (
                    <button
                        key={f}
                        role="tab"
                        type="button"
                        aria-selected={filter === f}
                        onClick={() => onFilter(f)}
                        className={cx(
                            "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                            filter === f ? "bg-night-900 text-white" : "text-slate-600 hover:bg-slate-100",
                        )}
                    >
                        {FILTER_LABEL[f]}
                        {list && <span className={cx("tabular-nums", filter === f ? "text-slate-300" : "text-slate-400")}>{list.counts[f]}</span>}
                    </button>
                ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {error && (
                    <div role="alert" className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
                        <p>{error}</p>
                        <Button variant="secondary" onClick={onRetry} className="mt-2 h-8">Tentar de novo</Button>
                    </div>
                )}
                {!list && !error && (
                    <p role="status" className="flex items-center gap-2 p-4 text-sm text-slate-500"><Spinner /> Carregando conversas…</p>
                )}
                {list && list.items.length === 0 && (
                    <p className="p-6 text-center text-sm text-slate-500">
                        {query.trim() ? "Nenhuma conversa encontrada para essa busca." : filter === "waiting" ? "Ninguém está esperando atendimento." : "Nenhuma conversa neste filtro."}
                    </p>
                )}
                {list && (
                    <ul>
                        {list.items.map((item) => {
                            const status = itemStatus(item, list.me.email);
                            const selected = item.id === selectedId;
                            const showBadge = item.waitingMessages > 0 && item.state !== "with_agent" && item.state !== "closed";
                            return (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        aria-current={selected}
                                        onClick={() => onSelect(item.id)}
                                        className={cx("flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left", selected ? "bg-brand-50" : "hover:bg-slate-50")}
                                    >
                                        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                                            {initials(item.employee.name)}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-baseline justify-between gap-2">
                                                <span className="truncate text-sm font-medium">{item.employee.name}</span>
                                                <span className="shrink-0 text-[11px] text-slate-400">{relativeTime(item.lastActivityAt, now)}</span>
                                            </span>
                                            <span className="mt-0.5 block truncate text-xs text-slate-500">{item.preview || "Sem mensagens"}</span>
                                            <span className="mt-1.5 flex items-center justify-between gap-2">
                                                <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                                                    <span aria-hidden="true" className={cx("size-1.5 rounded-full", TONE_DOT[status.tone])} />
                                                    {status.label}
                                                </span>
                                                {showBadge && (
                                                    <span className="grid min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-[11px] font-medium text-white" aria-label={`${item.waitingMessages} sem resposta`}>
                                                        {item.waitingMessages}
                                                    </span>
                                                )}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {me && (
                <div className="flex items-center gap-3 border-t border-slate-200 p-3">
                    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{initials(me.name)}</span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{me.name}</p>
                        <p className="text-xs text-slate-500">Suporte {me.level ?? ""}</p>
                    </div>
                    <LogoutButton className="h-8 px-2" />
                </div>
            )}
        </div>
    );
}