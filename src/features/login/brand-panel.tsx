import { Logo } from "@/components/brand/logo";

const FACTS = [
    { value: "~2 s", label: "até a primeira palavra da resposta" },
    { value: "24 h", label: "plantão para chamados críticos" },
    { value: "100%", label: "das ações do agent visíveis" },
] as const;

export function BrandPanel() {
    return (
        <aside className="hidden flex-col justify-between bg-night-900 p-12 text-white lg:flex">
            <Logo tone="light" />

            <div className="max-w-md">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">Service desk de TI da Nexo</p>
                <h1 className="text-4xl font-semibold leading-tight tracking-tight">Seu problema de TI, resolvido em uma conversa.</h1>
                <p className="mt-4 text-sm leading-relaxed text-slate-300">
                    Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um
                    analista quando precisar.
                </p>

                <div className="mt-8 space-y-2.5 rounded-2xl bg-night-800 p-4 ring-1 ring-white/5" aria-hidden="true">
                    <p className="ml-auto w-fit max-w-[85%] rounded-xl rounded-br-sm bg-brand-600 px-3 py-2 text-sm">
                        Meu notebook não conecta na VPN. Erro 809.
                    </p>
                    <div className="max-w-[90%] rounded-xl rounded-bl-sm bg-night-700 px-3 py-2 text-sm text-slate-200">
                        <p className="mb-1.5 flex flex-wrap gap-1.5 text-[11px] text-slate-400">
                            <span className="rounded-full bg-white/5 px-2 py-0.5">buscou na central de ajuda</span>
                            <span className="rounded-full bg-white/5 px-2 py-0.5">consultou seus chamados</span>
                        </p>
                        Isso depende da versão do Windows. Qual você usa?
                    </div>
                </div>
            </div>

            <dl className="grid grid-cols-3 gap-6 border-t border-white/10 pt-6">
                {FACTS.map((f) => (
                    <div key={f.label}>
                        <dt className="text-2xl font-semibold">{f.value}</dt>
                        <dd className="mt-1 text-xs leading-snug text-slate-400">{f.label}</dd>
                    </div>
                ))}
            </dl>
        </aside>
    );
}