import { cx } from "@/lib/cx";
import { CONFIDENCE_TEXT, confidenceLevel, ruleLabel, type ConfidenceLevel } from "@/lib/client/decision-labels";
import { INTENT_LABEL, type DecisionTrace } from "@/lib/domain/model/trace";

const BAR: Record<ConfidenceLevel, string> = { high: "bg-emerald-500", medium: "bg-amber-500", low: "bg-red-500" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
            <div className="mt-1">{children}</div>
        </section>
    );
}

export function DecisionPanel({ trace, id }: { trace: DecisionTrace; id: string }) {
    const level = confidenceLevel(trace.confidence);
    const percent = Math.round(trace.confidence * 100);

    return (
        <div id={id} className="mt-2 w-full max-w-xl space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <Section title="O que entendi">{trace.understood}</Section>

            <Section title="Intenção e segurança">
                <p>{INTENT_LABEL[trace.intent]}</p>
                <div className="mt-1.5 flex items-center gap-2">
                    <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Confiança do agent" className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-200">
                        <div className={cx("h-full", BAR[level])} style={{ width: `${percent}%` }} />
                    </div>
                    <span className="text-xs">{CONFIDENCE_TEXT[level]} ({percent}%)</span>
                </div>
            </Section>

            <Section title="Por quê">{trace.reasoning}</Section>

            {trace.actions.length > 0 && (
                <Section title="O que fiz">
                    <ol className="space-y-1.5">
                        {trace.actions.map((a, i) => (
                            <li key={i} className="flex items-start justify-between gap-3">
                                <span>
                                    <span className={cx("font-medium", a.status === "error" && "text-red-700")}>{a.label}</span>
                                    <span className="block text-xs text-slate-500">{a.summary}</span>
                                </span>
                                <span className="shrink-0 text-xs text-slate-400">{a.durationMs} ms</span>
                            </li>
                        ))}
                    </ol>
                </Section>
            )}

            {trace.rulesApplied.length > 0 && (
                <Section title="Regras aplicadas">
                    <ul className="list-disc space-y-0.5 pl-5">
                        {trace.rulesApplied.map((r) => (
                            <li key={r}>{ruleLabel(r)}</li>
                        ))}
                    </ul>
                </Section>
            )}

            {trace.handoffReason && <Section title="Transferência">{trace.handoffReason}</Section>}

            <p className="border-t border-slate-200 pt-2 text-xs text-slate-500">
                {trace.model} · {(trace.latencyMs / 1000).toFixed(1)} s · {trace.usage.inputTokens + trace.usage.outputTokens} tokens ({trace.usage.llmCalls} {trace.usage.llmCalls === 1 ? "chamada" : "chamadas"} ao modelo)
            </p>
        </div>
    );
}