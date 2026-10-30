import { describe, expect, it } from "vitest";
import { normalize, tokenize } from "./text";

describe("normalize", () => {
  it("remove acentos e pontuação", () => {
    expect(normalize("Atualização do Windows!")).toBe("atualizacao do windows");
  });
});

describe("tokenize", () => {
  it("remove stopwords e aplica stem", () => {
    expect(tokenize("Minha senha do SAP bloqueou de novo")).toEqual(["senha", "sap", "bloque", "novo"]);
  });

  it("variações da mesma palavra geram o mesmo token", () => {
    expect(tokenize("bloqueada")).toEqual(tokenize("bloqueou"));
    expect(tokenize("conecta")).toEqual(tokenize("conectar"));
  });

  it("mantém números (Windows 10 x 11 importa)", () => {
    expect(tokenize("Windows 11")).toContain("11");
  });
});