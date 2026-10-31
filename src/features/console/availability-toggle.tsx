import { cx } from "@/lib/cx";

export function AvailabilityToggle({ available, onChange }: { available: boolean; onChange(next: boolean): void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={available}
            onClick={() => onChange(!available)}
            title="Informativo: por enquanto não altera o roteamento das conversas."
            className="flex items-center gap-2 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
            <span aria-hidden="true" className={cx("size-2 rounded-full", available ? "bg-emerald-500" : "bg-slate-400")} />
            {available ? "Disponível" : "Indisponível"}
        </button>
    );
}