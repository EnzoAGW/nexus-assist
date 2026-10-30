import { describe, expect, it } from "vitest";
import { parseUi } from "./ui";

describe("parseUi", () => {
  it("lê elementos válidos", () => {
    expect(parseUi({ elements: [{ type: "ticket_card", ticketId: "INC-1" }, { type: "quick_replies", options: ["a", "b"] }] })).toHaveLength(2);
  });

  it("descarta o que não reconhece e mantém o resto", () => {
    const result = parseUi({ elements: [{ type: "hackear" }, { type: "ticket_card", ticketId: "INC-1" }, { type: "ticket_card" }] });
    expect(result).toEqual([{ type: "ticket_card", ticketId: "INC-1" }]);
  });

  it("lixo vira lista vazia, nunca exceção", () => {
    for (const bad of [null, undefined, "x", 42, {}, { elements: "x" }]) expect(parseUi(bad)).toEqual([]);
  });
});