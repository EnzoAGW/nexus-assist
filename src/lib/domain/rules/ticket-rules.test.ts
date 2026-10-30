import { describe, expect, it } from "vitest";
import { canAccessTicket, canReopen } from "./ticket-rules";

const now = new Date("2026-10-28T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

describe("canReopen", () => {
  it("resolvido há 4 dias: pode", () => {
    expect(canReopen({ status: "resolved", resolvedAt: daysAgo(4) }, now)).toBe(true);
  });
  it("resolvido há exatamente 7 dias: pode", () => {
    expect(canReopen({ status: "resolved", resolvedAt: daysAgo(7) }, now)).toBe(true);
  });
  it("resolvido há 8 dias: não pode", () => {
    expect(canReopen({ status: "resolved", resolvedAt: daysAgo(8) }, now)).toBe(false);
  });
  it("não resolvido: não pode", () => {
    expect(canReopen({ status: "open", resolvedAt: null }, now)).toBe(false);
  });
});

describe("canAccessTicket", () => {
  it("só o solicitante acessa, sem diferenciar maiúsculas", () => {
    expect(canAccessTicket({ requesterEmail: "ana.souza@nexo.com.br" }, "Ana.Souza@nexo.com.br")).toBe(true);
    expect(canAccessTicket({ requesterEmail: "ana.souza@nexo.com.br" }, "carla@nexo.com.br")).toBe(false);
  });
});