import { describe, expect, it } from "vitest";
import { daysSince, formatPasswordAge, initials } from "./format";

describe("format", () => {
    it("iniciais", () => {
        expect(initials("Ana Souza")).toBe("AS");
        expect(initials("ana maria de souza")).toBe("AS");
        expect(initials("Ana")).toBe("A");
        expect(initials("  ")).toBe("?");
    });

    it("idade da senha", () => {
        expect(formatPasswordAge(0)).toBe("Alterada hoje");
        expect(formatPasswordAge(1)).toBe("Alterada há 1 dia");
        expect(formatPasswordAge(42)).toBe("Alterada há 42 dias");
        expect(daysSince(new Date("2026-10-01T12:00:00Z"), new Date("2026-10-29T11:00:00Z"))).toBe(27);
    });
});