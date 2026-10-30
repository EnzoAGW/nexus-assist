export interface LoginInput {
    email: string;
    password: string;
    remember: boolean;
}

export type LoginResult =
    | { ok: true; redirectTo: "/chat" | "/console" }
    | { ok: false; kind: "invalid" | "rate_limited" | "network" | "server"; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validação de preenchimento no cliente (a de verdade é do servidor). Devolve a mensagem ou null. */
export function validateLogin({ email, password }: Pick<LoginInput, "email" | "password">): string | null {
    if (!email.trim()) return "Informe o e-mail corporativo.";
    if (!EMAIL.test(email.trim())) return "Esse e-mail não parece válido.";
    if (!password) return "Informe a senha.";
    return null;
}

/** Só navegamos para destinos conhecidos, mesmo que a resposta do servidor diga outra coisa. */
const safeRedirect = (value: unknown): "/chat" | "/console" => (value === "/console" ? "/console" : "/chat");

export function formatWait(seconds: number): string {
    if (seconds < 60) return `${seconds} segundo${seconds === 1 ? "" : "s"}`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minuto${minutes === 1 ? "" : "s"}`;
}

export async function submitLogin(input: LoginInput, fetchImpl: typeof fetch = fetch): Promise<LoginResult> {
    let res: Response;
    try {
        res = await fetchImpl("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: input.email.trim(), password: input.password, remember: input.remember }),
        });
    } catch {
        return { ok: false, kind: "network", message: "Não consegui conectar. Verifique sua conexão e tente de novo." };
    }

    if (res.ok) {
        const data = (await res.json().catch(() => null)) as { redirectTo?: unknown } | null;
        return { ok: true, redirectTo: safeRedirect(data?.redirectTo) };
    }

    if (res.status === 429) {
        const wait = Number(res.headers.get("Retry-After"));
        const suffix = Number.isFinite(wait) && wait > 0 ? ` Tente de novo em ${formatWait(wait)}.` : " Aguarde um pouco e tente de novo.";
        return { ok: false, kind: "rate_limited", message: `Muitas tentativas.${suffix}` };
    }
    if (res.status === 400 || res.status === 401) {
        return { ok: false, kind: "invalid", message: "E-mail ou senha inválidos." };
    }
    return { ok: false, kind: "server", message: "Algo deu errado do nosso lado. Tente novamente em instantes." };
}