import type { HandoffKind } from "@/lib/domain/rules/handoff";
import { kindTone } from "@/lib/client/console-rules";
import { cx } from "@/lib/cx";
import { TONE_PILL } from "./tones";

export function HandoffSummary({ kind, kindLabel, reason, summary }: { kind: HandoffKind | null; kindLabel: string | null; reason: string | null; summary: string | null }) {
    if (!reason && !summary) return null;
    return (
        <section aria-label="Resumo da transferência" className={cx("rounded-xl p-4 ring-1", TONE_PILL[kindTone(kind)])}>
            <p className="text-[11px] font-semibold uppercase tracking-wide">Resumo da transferência{kindLabel ? ` · ${kindLabel}` : ""}</p>
            {reason && <p className="mt-1.5 text-sm font-medium">{reason}</p>}
            {summary && <p className="mt-1 text-sm">{summary}</p>}
        </section>
    );
}