import { describe, expect, it } from "vitest";
import { confidenceLevel, ruleLabel } from "./decision-labels";

describe("decision labels", () => {
  it("regra conhecida em português; desconhecida pelo próprio id", () => {
    expect(ruleLabel("person-blocked")).toBe("Impede uma pessoa de trabalhar");
    expect(ruleLabel("regra-nova")).toBe("regra-nova");
  });

  it("a confiança usa as faixas do roteamento (0,55 e 0,8)", () => {
    expect(confidenceLevel(0.95)).toBe("high");
    expect(confidenceLevel(0.8)).toBe("high");
    expect(confidenceLevel(0.7)).toBe("medium");
    expect(confidenceLevel(0.55)).toBe("medium");
    expect(confidenceLevel(0.3)).toBe("low");
  });
});