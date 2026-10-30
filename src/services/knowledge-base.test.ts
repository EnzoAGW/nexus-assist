import { describe, expect, it } from "vitest";
import { ARTICLES } from "@/db/seed-data";
import { rankArticles, type Article } from "./knowledge-base";

const list: Article[] = ARTICLES.map((a) => ({ ...a }));
const top = (query: string) => rankArticles(query, list)[0]?.article.id;

describe("rankArticles", () => {
  it("encontra o artigo da VPN pelo erro", () => {
    expect(top("minha vpn dá erro 809")).toBe("kb-vpn-809");
  });

  it("encontra o horário do service desk", () => {
    expect(top("qual o horário de atendimento?")).toBe("kb-horario");
  });

  it("encontra senha, equipamento e Wi-Fi com variações da palavra", () => {
    expect(top("esqueci minha senha")).toBe("kb-senha-rede");
    expect(top("quero pedir um monitor novo")).toBe("kb-solicitar-equipamento");
    expect(top("o wifi não conecta")).toBe("kb-wifi");
  });

  it("devolve os termos que casaram", () => {
    const [hit] = rankArticles("vpn erro 809", list);
    expect(hit?.matchedTerms).toContain("erro 809");
  });

  it("sem resposta na central quando o assunto não tem artigo", () => {
    expect(rankArticles("receita de bolo de cenoura", list)).toEqual([]);
  });

  it("respeita o limite", () => {
    expect(rankArticles("senha vpn wifi monitor", list, 2)).toHaveLength(2);
  });
});