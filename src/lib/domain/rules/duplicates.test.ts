import { describe, expect, it } from "vitest";
import { findDuplicates } from "./duplicates";
import type { TicketStatus } from "../model/enums";

const now = new Date("2026-10-28T18:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

const t = (id: string, title: string, status: TicketStatus, resolvedDaysAgo?: number) => ({
  id,
  title,
  status,
  resolvedAt: resolvedDaysAgo === undefined ? null : daysAgo(resolvedDaysAgo),
});

describe("findDuplicates", () => {
  it("mesmo problema em chamado ativo: atualizar", () => {
    const tickets = [t("INC-1", "Notebook lento após atualização do Windows", "open")];
    const [hit] = findDuplicates({ title: "Notebook muito lento depois da atualização do Windows" }, tickets, now);
    expect(hit?.ticket.id).toBe("INC-1");
    expect(hit?.action).toBe("update");
  });

  it("resolvido há até 7 dias: reabrir", () => {
    const tickets = [t("INC-2", "Senha do SAP bloqueada", "resolved", 4)];
    const [hit] = findDuplicates({ title: "Senha do SAP bloqueada novamente" }, tickets, now);
    expect(hit?.action).toBe("reopen");
  });

  it("resolvido há mais de 7 dias: não é duplicata", () => {
    const tickets = [t("INC-3", "Outlook não sincroniza no celular", "resolved", 9)];
    expect(findDuplicates({ title: "Outlook não sincroniza no celular de novo" }, tickets, now)).toEqual([]);
  });

  it("problema diferente com uma palavra em comum não casa", () => {
    const tickets = [t("INC-4", "Notebook lento após atualização do Windows", "open")];
    expect(findDuplicates({ title: "Notebook não liga" }, tickets, now)).toEqual([]);
  });

  it("encerrado nunca é duplicata", () => {
    const tickets = [t("INC-5", "VPN com erro 809", "closed")];
    expect(findDuplicates({ title: "VPN com erro 809" }, tickets, now)).toEqual([]);
  });

  it("ordena pelo maior score", () => {
    const tickets = [
      t("INC-6", "VPN erro 809 no Windows", "open"),
      t("INC-7", "VPN erro 809", "open"),
    ];
    const result = findDuplicates({ title: "VPN com erro 809" }, tickets, now);
    expect(result.length).toBe(2);
    expect(result[0]!.score).toBeGreaterThanOrEqual(result[1]!.score);
  });
});