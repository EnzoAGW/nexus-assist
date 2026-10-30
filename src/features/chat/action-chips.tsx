import type { TraceAction } from "@/lib/domain/model/trace";
import { cx } from "@/lib/cx";

export function ActionChips({ actions }: { actions: TraceAction[] }) {
    if (actions.length === 0) return null;
    return (
        <ul aria-label="Ações do assistente nesta resposta" className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {actions.map((a, i) => (
                <li
                    key={i}
                    className={cx("rounded-full px-2 py-0.5 text-[11px]", a.status === "ok" ? "bg-slate-100 text-slate-600" : "bg-red-50 text-red-700")}
                >
                    <span aria-hidden="true">{a.status === "ok" ? "✓" : "!"} </span>
                    {a.label}
                </li>
            ))}
        </ul>
    );
}