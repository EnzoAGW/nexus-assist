"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { submitLogin, validateLogin } from "@/lib/client/login";
import { DEMO_ACCOUNTS } from "./demo-accounts";

const STUB_HINT = "Neste protótipo este recurso é ilustrativo.";

export function LoginForm({ showDemoAccounts }: { showDemoAccounts: boolean }) {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [remember, setRemember] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hint, setHint] = useState<string | null>(null);

    async function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (pending) return;
        setHint(null);

        const problem = validateLogin({ email, password });
        if (problem) return setError(problem);

        setError(null);
        setPending(true);
        const result = await submitLogin({ email, password, remember });
        if (result.ok) {
            router.replace(result.redirectTo); // continua "carregando" até a navegação acontecer
            router.refresh();
            return;
        }
        setPending(false);
        setError(result.message);
    }

    return (
        <div className="w-full max-w-sm">
            <h2 className="text-3xl font-semibold tracking-tight">Entrar</h2>
            <p className="mt-2 text-sm text-slate-600">Use seu e-mail corporativo para falar com o Nexo Assist.</p>

            <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
                <TextField
                    label="E-mail corporativo"
                    type="email"
                    name="email"
                    autoComplete="username"
                    placeholder="nome.sobrenome@nexo.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={error !== null}
                />
                <TextField
                    label="Senha"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={error !== null}
                    labelAside={
                        <button type="button" onClick={() => setHint(STUB_HINT)} className="text-xs font-medium text-brand-600 hover:underline">
                            Esqueci minha senha
                        </button>
                    }
                    trailing={
                        <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-pressed={showPassword}
                            className="rounded px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-800"
                        >
                            {showPassword ? "Ocultar" : "Mostrar"}
                        </button>
                    }
                />

                <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="size-4 rounded border-slate-300 accent-brand-600"
                    />
                    Manter-me conectado neste computador
                </label>

                <div aria-live="polite" className="min-h-5 text-sm">
                    {error && <p role="alert" className="text-red-600">{error}</p>}
                    {!error && hint && <p role="status" className="text-slate-500">{hint}</p>}
                </div>

                <Button type="submit" loading={pending} className="h-11 w-full">
                    {pending ? "Entrando…" : "Entrar"}
                </Button>
            </form>

            <p className="mt-6 text-sm text-slate-600">
                Precisa de acesso?{" "}
                <button type="button" onClick={() => setHint(STUB_HINT)} className="font-medium text-brand-600 hover:underline">
                    Fale com o time de TI
                </button>
            </p>

            {showDemoAccounts && (
                <details className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                    <summary className="cursor-pointer font-medium text-slate-700">Contas de demonstração (qualquer senha)</summary>
                    <ul className="mt-3 space-y-1.5">
                        {DEMO_ACCOUNTS.map((a) => (
                            <li key={a.email}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEmail(a.email);
                                        setPassword("demo");
                                        setError(null);
                                    }}
                                    className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white"
                                >
                                    <span className="font-medium text-slate-800">{a.label}</span>
                                    <span className="text-xs text-slate-500">{a.role}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}