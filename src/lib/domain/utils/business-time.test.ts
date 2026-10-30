import { describe, expect, it } from "vitest";
import { addBusinessHours } from "./business-time";

const br = (s: string) => new Date(`${s}:00-03:00`);

describe("addBusinessHours", () => {
    it("soma dentro do mesmo dia", () => {
        expect(addBusinessHours(br("2026-10-26T10:00"), 4)).toEqual(br("2026-10-26T14:00"));
    });

    it("atravessa o fim do expediente", () => {
        expect(addBusinessHours(br("2026-10-26T16:00"), 4)).toEqual(br("2026-10-27T10:00"));
    });

    it("pula o fim de semana", () => {
        expect(addBusinessHours(br("2026-10-30T17:00"), 4)).toEqual(br("2026-11-02T11:00"));
    });

    it("começa a contar na abertura quando está fora do expediente", () => {
        expect(addBusinessHours(br("2026-10-31T10:00"), 1)).toEqual(br("2026-11-02T09:00")); // sábado
        expect(addBusinessHours(br("2026-10-26T07:00"), 1)).toEqual(br("2026-10-26T09:00")); // antes das 8h
        expect(addBusinessHours(br("2026-10-26T18:00"), 1)).toEqual(br("2026-10-27T09:00")); // após as 18h
    });

    it("termina exatamente às 18h quando cabe", () => {
        expect(addBusinessHours(br("2026-10-26T14:00"), 4)).toEqual(br("2026-10-26T18:00"));
    });
});