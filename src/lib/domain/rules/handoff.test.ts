import { describe, expect, it } from "vitest";
import { HANDOFF, handoffKind, uncertainReason } from "./handoff";

describe("handoffKind", () => {
    it("reconhece cada motivo produzido pelo sistema", () => {
        expect(handoffKind(HANDOFF.requested)).toBe("requested");
        expect(handoffKind(HANDOFF.critical)).toBe("critical");
        expect(handoffKind(uncertainReason(0.31))).toBe("uncertain");
    });

    it("sem motivo é null; motivo desconhecido é 'other'", () => {
        expect(handoffKind(null)).toBeNull();
        expect(handoffKind("qualquer coisa")).toBe("other");
    });
});