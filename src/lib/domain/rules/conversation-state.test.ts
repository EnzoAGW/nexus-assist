import { describe, expect, it } from "vitest";
import { agentMayReply, analystMayReply, canTransition } from "./conversation-state";

describe("conversation state", () => {
  it("fluxo de transferência", () => {
    expect(canTransition("with_agent", "awaiting_analyst")).toBe(true);
    expect(canTransition("awaiting_analyst", "with_analyst")).toBe(true);
    expect(canTransition("with_analyst", "with_agent")).toBe(true);
    expect(canTransition("with_analyst", "closed")).toBe(true);
  });

  it("transições inválidas", () => {
    expect(canTransition("with_agent", "with_analyst")).toBe(false); // precisa passar pela fila
    expect(canTransition("closed", "with_agent")).toBe(false);
  });

  it("o agent só responde com a conversa dele", () => {
    expect(agentMayReply("with_agent")).toBe(true);
    expect(agentMayReply("awaiting_analyst")).toBe(false);
    expect(agentMayReply("with_analyst")).toBe(false);
    expect(agentMayReply("closed")).toBe(false);
  });

  it("o analista só escreve depois de assumir", () => {
    expect(analystMayReply("with_analyst")).toBe(true);
    expect(analystMayReply("awaiting_analyst")).toBe(false);
  });
});