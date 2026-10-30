// const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let failed = 0;

const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed++;
};

async function login(email: string): Promise<string> {
    const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "x", remember: false }),
    });
    if (!res.ok) throw new Error(`login de ${email} falhou (${res.status})`);
    return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

async function call<T = Record<string, unknown>>(cookie: string | null, method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: T | null = null;
    try {
        json = JSON.parse(text) as T;
    } catch {
        /* corpo não é JSON */
    }
    return { status: res.status, json };
}

interface ListRes {
    items: { id: string; employee: { email: string }; state: string; handoffKind: string | null; waitingMessages: number }[];
    counts: Record<string, number>;
    me: { name: string };
}
interface DetailRes {
    conversation: { state: string };
    messages: unknown[];
    tickets: { id: string }[] | null;
}
interface ConvRes {
    conversation: { state: string };
}

async function main() {
    const [rafael, marina, diego] = await Promise.all([
        login("rafael.lima@nexo.com.br"),
        login("marina.costa@nexo.com.br"),
        login("diego.ramos@nexo.com.br"),
    ]);

    console.log("— Segurança —");
    check("sem sessão: console responde 401", (await call(null, "GET", "/api/console/conversations")).status === 401);
    check("funcionário não acessa o console (403)", (await call(diego, "GET", "/api/console/conversations")).status === 403);
    check("analista não usa o chat do funcionário (403)", (await call(rafael, "POST", "/api/chat", { text: "oi" })).status === 403);
    check("analista não lê /api/tickets do funcionário (403)", (await call(rafael, "GET", "/api/tickets")).status === 403);
    const mine = await call<{ tickets: { id: string }[] }>(diego, "GET", "/api/tickets");
    check("funcionário só vê os próprios chamados", mine.json?.tickets.map((t) => t.id).join() === "REQ-10451", mine.json?.tickets.map((t) => t.id).join());

    console.log("\n— Fluxo do analista (precisa do banco recém-resetado) —");
    const list = await call<ListRes>(rafael, "GET", "/api/console/conversations?filter=waiting");
    const ana = list.json?.items.find((i) => i.employee.email === "ana.souza@nexo.com.br");
    check("lista a conversa da Ana na fila", !!ana, `${list.json?.items.length ?? 0} na fila, motivo: ${ana?.handoffKind}`);
    if (!ana) return console.log('Rode "npm run db:reset" e tente de novo.');
    console.log(`   abas: ${JSON.stringify(list.json?.counts)} | analista: ${list.json?.me.name}`);

    check("funcionário não lê a conversa pelo console (403)", (await call(diego, "GET", `/api/console/conversations/${ana.id}`)).status === 403);

    const detail = await call<DetailRes>(rafael, "GET", `/api/console/conversations/${ana.id}`);
    check("detalhe: histórico e os chamados da Ana", (detail.json?.messages.length ?? 0) >= 3 && (detail.json?.tickets?.length ?? 0) === 5, `${detail.json?.messages.length} mensagens, ${detail.json?.tickets?.length} chamados`);

    check("analista não responde antes de assumir (403)", (await call(rafael, "POST", `/api/console/conversations/${ana.id}/messages`, { text: "oi" })).status === 403);

    const claim = await call<ConvRes>(rafael, "POST", `/api/console/conversations/${ana.id}/action`, { action: "claim" });
    check("assumir: with_analyst", claim.json?.conversation.state === "with_analyst");
    check("segundo analista não assume a mesma conversa (409)", (await call(marina, "POST", `/api/console/conversations/${ana.id}/action`, { action: "claim" })).status === 409);
    check("outro analista não responde (403)", (await call(marina, "POST", `/api/console/conversations/${ana.id}/messages`, { text: "oi" })).status === 403);
    check("analista responde depois de assumir", (await call(rafael, "POST", `/api/console/conversations/${ana.id}/messages`, { text: "Oi, Ana! Vou verificar o notebook." })).status === 200);

    const back = await call<ConvRes>(rafael, "POST", `/api/console/conversations/${ana.id}/action`, { action: "return" });
    check("devolver ao agent: with_agent", back.json?.conversation.state === "with_agent");

    await call(rafael, "POST", `/api/console/conversations/${ana.id}/action`, { action: "claim" }).catch(() => null);

    const reclaim = await call<ConvRes>(rafael, "POST", `/api/console/conversations/${ana.id}/action`, { action: "claim" });
    const closed = await call<ConvRes>(rafael, "POST", `/api/console/conversations/${ana.id}/action`, { action: "close" });
    check("reassumir e encerrar: closed", reclaim.json?.conversation.state === "with_analyst" && closed.json?.conversation.state === "closed");

    console.log(`\n${failed === 0 ? "Tudo certo." : `${failed} verificação(ões) falharam.`}`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
    const cause = (err as { cause?: { code?: string } }).cause;
    console.error(cause?.code === "ECONNREFUSED" ? `Não consegui conectar em ${BASE}. Suba o servidor com "npm run dev".` : err);
    process.exit(1);
});