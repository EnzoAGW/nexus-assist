import { useId } from "react";
import { cx } from "@/lib/cx";
import type { TicketDto } from "@/server/serialize";
import { StatusChip } from "./ticket-card";

export function TicketPicker({ ids, tickets, enabled, onPick }: { ids: string[]; tickets: TicketDto[] | null; enabled: boolean; onPick(t: TicketDto): void }) {
    const name = useId();
    const items = ids.flatMap((id) => tickets?.find((t) => t.id === id) ?? []);
    if (items.length === 0) return null;

    return (
        <fieldset disabled={!enabled} className="mt-2 w-full max-w-md space-y-1.5">
            <legend className="sr-only">Escolha o chamado</legend>
            {items.map((t) => (
                <label
                    key={t.id}
                    className={cx(
                        "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                        enabled ? "cursor-pointer border-slate-200 bg-white hover:border-brand-600" : "border-slate-100 bg-slate-50 text-slate-400",
                    )}
                >
                    <input type="radio" name={name} onChange={() => onPick(t)} className="accent-brand-600" />
                    <span className="font-mono text-xs text-slate-500">{t.id}</span>
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <StatusChip ticket={t} />
                </label>
            ))}
        </fieldset>
    );
}