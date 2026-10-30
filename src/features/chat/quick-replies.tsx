export function QuickReplies({ options, enabled, onPick }: { options: string[]; enabled: boolean; onPick(text: string): void }) {
    return (
        <div role="group" aria-label="Respostas rápidas" className="mt-2 flex flex-wrap gap-2">
            {options.map((o) => (
                <button
                    key={o}
                    type="button"
                    disabled={!enabled}
                    onClick={() => onPick(o)}
                    className="rounded-full border border-brand-600/40 bg-white px-3 py-1.5 text-sm text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                >
                    {o}
                </button>
            ))}
        </div>
    );
}