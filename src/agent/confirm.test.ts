import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TicketDraft } from "@/lib/domain/schemas";
import type { PendingAction } from "@/lib/domain/schemas";
import { TicketSystemUnavailableError } from "@/services/errors";
import { executePending } from "./confirm";
import { ANA, createAgentEnv, type AgentEnv } from "./testing";
let env: AgentEnv;

const DRAFT: TicketDraft = {
    title: "Teclado com teclas falhando",
    description: "Algumas teclas do teclado pararam de responder durante o uso.",
    type: "INC",
    category: "Hardware",
    priority: "medium",
    impact: "single",
};

const setPending = (action: PendingAction) =>
    env.services().conversations.setPendingAction(ANA, env.conversationId, action);
const confirm = (failureRate = 0) => executePending(env.services(failureRate), ANA, env.conversationId);
const conversation = () => env.services().conversations.getForUser(ANA, env.conversationId);

beforeEach(async () => {
    env = await createAgentEnv();
});

afterEach(async () => {
    await env.ctx.cleanup();
});

describe("executePending", () => {
    it("cria o chamado e uma segunda confirmação não faz nada", async () => {
        await setPending({ kind: "create_ticket", draft: DRAFT });
        const first = await confirm();
        expect(first.outcome).toMatchObject({ status: "created", handedOff: false });
        expect(first.text).toContain("INC-20312");
        expect((await confirm()).outcome).toEqual({ status: "nothing_pending" });
    });

    it("chamado crítico: cria e já transfere para um analista", async () => {
        await setPending({ kind: "create_ticket", draft: { ...DRAFT, priority: "critical", impact: "team" } });
        const result = await confirm();
        expect(result.outcome).toMatchObject({ status: "created", handedOff: true });
        expect(result.rules).toContain("critical-handoff");
        expect((await conversation())?.state).toBe("awaiting_analyst");
    });

    it("problema que já virou chamado: não duplica", async () => {
        await setPending({
            kind: "create_ticket",
            draft: { ...DRAFT, title: "Notebook muito lento depois da atualização do Windows" },
        });
        expect((await confirm()).outcome).toMatchObject({ status: "duplicate", existing: { id: "INC-20311" } });
        expect(await env.services().tickets.listForUser(ANA)).toHaveLength(3);
    });

    it("resolvido há 4 dias: a confirmação reabre", async () => {
        await setPending({ kind: "update_ticket", ticketId: "INC-20150", note: "Bloqueou de novo hoje.", reopen: true });
        expect((await confirm()).outcome).toMatchObject({ status: "reopened", ticket: { status: "open" } });
    });

    it("legado fora: o erro sobe, o rascunho volta e a nova tentativa funciona", async () => {
        await setPending({ kind: "create_ticket", draft: DRAFT });
        await expect(confirm(1)).rejects.toBeInstanceOf(TicketSystemUnavailableError);
        expect((await conversation())?.pendingAction).not.toBeNull();
        expect((await confirm(0)).outcome).toMatchObject({ status: "created" });
    });
});