import { describe, expect, it } from "vitest";
import { INITIAL_LIVE, liveReducer, selectLive, type LiveState } from "./live-resource";

const start: LiveState<string> = INITIAL_LIVE;

describe("liveReducer + selectLive", () => {
    it("o dado aparece só para a chave a que pertence", () => {
        const s = liveReducer(start, { type: "ok", key: "a", data: "A" });
        expect(selectLive(s, "a", false).data).toBe("A");
        expect(selectLive(s, "b", false).data).toBeNull(); // trocar de conversa nunca mostra a anterior
    });

    it("com keepPrevious (lista), o dado antigo fica até o novo chegar", () => {
        const s = liveReducer(start, { type: "ok", key: "a", data: "A" });
        expect(selectLive(s, "b", true).data).toBe("A");
    });

    it("falha mantém o dado da mesma chave e expõe o erro; o próximo sucesso limpa", () => {
        const failed = liveReducer(liveReducer(start, { type: "ok", key: "a", data: "A" }), { type: "fail", key: "a", error: new Error("x") });
        expect(selectLive(failed, "a", false)).toMatchObject({ data: "A", error: expect.any(Error) });
        expect(selectLive(liveReducer(failed, { type: "ok", key: "a", data: "A2" }), "a", false)).toEqual({ data: "A2", error: null });
    });

    it("erro de outra chave não aparece", () => {
        const s = liveReducer(start, { type: "fail", key: "a", error: new Error("x") });
        expect(selectLive(s, "b", false).error).toBeNull();
    });

    it("sem chave (nada selecionado), não há dado nem erro", () => {
        expect(selectLive(start, null, false)).toEqual({ data: null, error: null });
    });
});