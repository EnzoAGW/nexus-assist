import { Button } from "@/components/ui/button";
import type { ConversationState } from "@/lib/domain/model/enums";

const BANNER: Partial<Record<ConversationState, { tone: string; text: string }>> = {
    awaiting_analyst: { tone: "bg-amber-50 text-amber-900 ring-amber-200", text: "Aguardando um analista. O assistente está pausado, mas você pode continuar escrevendo: o analista vê tudo ao assumir." },
    with_analyst: { tone: "bg-brand-50 text-brand-700 ring-brand-100", text: "Você está falando com um analista do service desk. O assistente está pausado." },
    closed: { tone: "bg-slate-100 text-slate-700 ring-slate-200", text: "Este atendimento foi encerrado." },
};

export function StateBanner({ state, onRestart }: { state: ConversationState; onRestart(): void }) {
    const banner = BANNER[state];
    if (!banner) return null;
    return (
        <div role="status" className={`mx-auto mb-3 flex w-full max-w-3xl items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-sm ring-1 ${banner.tone}`}>
            <p>{banner.text}</p>
            {state === "closed" && <Button variant="secondary" onClick={onRestart} className="h-8 shrink-0">Nova conversa</Button>}
        </div>
    );
}