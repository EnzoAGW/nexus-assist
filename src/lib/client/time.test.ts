import { describe, expect, it } from "vitest";
import { clockTime, relativeTime } from "./time";

const now = new Date("2026-10-29T15:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
    it("escala de agora a dias", () => {
        expect(relativeTime(ago(20_000), now)).toBe("agora");
        expect(relativeTime(ago(5 * MIN), now)).toBe("há 5 min");
        expect(relativeTime(ago(3 * HOUR), now)).toBe("há 3 h");
        expect(relativeTime(ago(DAY + HOUR), now)).toBe("ontem");
        expect(relativeTime(ago(3 * DAY), now)).toBe("há 3 dias");
    });

    it("mais de uma semana vira data", () => {
        expect(relativeTime("2026-10-01T15:00:00Z", now)).toBe("01/10");
    });

    it("relógio adiantado nunca gera tempo negativo", () => {
        expect(relativeTime(new Date(now.getTime() + HOUR).toISOString(), now)).toBe("agora");
    });
});

describe("clockTime", () => {
    it("usa o fuso de Brasília", () => {
        expect(clockTime("2026-10-29T15:30:00Z")).toBe("12:30");
    });
});