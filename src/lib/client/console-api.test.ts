import { describe, expect, it } from "vitest";
import { ConsoleApiError, fetchList, friendlyError, postReply, runAction } from "./console-api";
import { SessionExpiredError } from "./chat-api";

const respond = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const spy = () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const impl = (async (url: unknown, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    return { calls, impl };
};

describe("pedidos", () => {
    it("lista: filtro sempre, busca só quando existe (e sem espaços)", async () => {
        const s = spy();
        await fetchList({ filter: "waiting", query: "  ana " }, s.impl);
        await fetchList({ filter: "all", query: "   " }, s.impl);
        expect(s.calls.map((c) => c.url)).toEqual(["/api/console/conversations?filter=waiting&q=ana", "/api/console/conversations?filter=all"]);
    });

    it("ação e resposta: caminho com o id codificado e corpo JSON", async () => {
        const s = spy();
        await runAction("a/b", "claim", s.impl);
        await postReply("c1", "Olá!", s.impl);
        expect(s.calls[0]?.url).toBe("/api/console/conversations/a%2Fb/action");
        expect(JSON.parse(String(s.calls[0]?.init?.body))).toEqual({ action: "claim" });
        expect(JSON.parse(String(s.calls[1]?.init?.body))).toEqual({ text: "Olá!" });
    });
});

describe("erros", () => {
    it("401 vira sessão expirada", async () => {
        await expect(fetchList({ filter: "all", query: "" }, respond(401))).rejects.toBeInstanceOf(SessionExpiredError);
    });

    it("erro da API carrega status e código", async () => {
        await expect(runAction("c", "claim", respond(409, { error: { code: "invalid_transition", message: "x" } }))).rejects.toMatchObject({ status: 409, code: "invalid_transition" });
    });

    it("rede fora tem status 0", async () => {
        const offline = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
        await expect(fetchList({ filter: "all", query: "" }, offline)).rejects.toMatchObject({ status: 0 });
    });

    it("mensagens para o analista", () => {
        expect(friendlyError(new ConsoleApiError(409, "invalid_transition", "x"))).toContain("mudou de estado");
        expect(friendlyError(new ConsoleApiError(403, "not_assigned", "x"))).toContain("outro analista");
        expect(friendlyError(new ConsoleApiError(404, "not_found", "x"))).toContain("não encontrada");
        expect(friendlyError(new ConsoleApiError(503, "ticket_system_unavailable", "Sistema instável"))).toBe("Sistema instável");
        expect(friendlyError(new Error("interno"))).toBe("Algo deu errado. Tente novamente.");
    });
});