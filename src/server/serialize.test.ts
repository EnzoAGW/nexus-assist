import { describe, expect, it } from "vitest";
import type { Message } from "@/services/conversations";
import type { TicketView } from "@/services/tickets";
import { toMessageDto, toTicketDto } from "./serialize";

const at = new Date("2026-10-28T15:00:00Z");

describe("serialização para o cliente", () => {
  it("chamado: datas em ISO, rótulos e sem o e-mail do solicitante", () => {
    const view: TicketView = {
      id: "INC-1", requesterEmail: "ana.souza@nexo.com.br", title: "Notebook lento",
      description: "d".repeat(30), type: "INC", category: "Hardware", priority: "high", impact: "single",
      status: "open", createdAt: at, lastUpdatedAt: at, resolvedAt: null, dueAt: at, overdue: false, reopenable: false,
    };
    const dto = toTicketDto(view);
    expect(dto).not.toHaveProperty("requesterEmail");
    expect(dto).toMatchObject({ priorityLabel: "Alta", statusLabel: "Aberto", dueAt: "2026-10-28T15:00:00.000Z" });
  });

  it("mensagem: sem o id da conversa", () => {
    const message: Message = {
      id: "m1", conversationId: "c1", role: "agent", content: "oi", authorEmail: null, trace: null, ui: null, createdAt: at,
    };
    const dto = toMessageDto(message);
    expect(dto).not.toHaveProperty("conversationId");
    expect(dto.createdAt).toBe("2026-10-28T15:00:00.000Z");
  });
});