import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown";

describe("parseInline", () => {
    it("negrito no meio da frase", () => {
        expect(parseInline("O **INC-1** venceu")).toEqual([
            { text: "O ", bold: false },
            { text: "INC-1", bold: true },
            { text: " venceu", bold: false },
        ]);
    });

    it("negrito sem fechar fica como texto", () => {
        expect(parseInline("2 ** 3")).toEqual([{ text: "2 ** 3", bold: false }]);
    });
});

describe("parseMarkdown", () => {
    it("parágrafos separados por linha em branco, quebras simples dentro do parágrafo", () => {
        const blocks = parseMarkdown("linha 1\nlinha 2\n\noutro");
        expect(blocks).toHaveLength(2);
        expect(blocks[0]).toMatchObject({ type: "p", lines: [[{ text: "linha 1" }], [{ text: "linha 2" }]] });
    });

    it("lista com asteriscos e negrito (como o modelo costuma escrever)", () => {
        const [list] = parseMarkdown("*   **Windows 10:** reinstale\n*   **Windows 11:** abra um chamado");
        expect(list).toMatchObject({ type: "ul" });
        expect(list?.type === "ul" && list.items).toHaveLength(2);
        expect(list?.type === "ul" && list.items[0]?.[0]).toEqual({ text: "Windows 10:", bold: true });
    });

    it("título vira negrito, sem marcação", () => {
        expect(parseMarkdown("## Resumo")).toEqual([{ type: "p", lines: [[{ text: "Resumo", bold: true }]] }]);
    });

    it("HTML do modelo continua sendo texto", () => {
        const [p] = parseMarkdown('<img src=x onerror="alert(1)"> **ok**');
        expect(p?.type === "p" && p.lines[0]?.[0]?.text).toBe('<img src=x onerror="alert(1)"> ');
    });

    it("texto vazio não gera blocos", () => {
        expect(parseMarkdown("  \n\n ")).toEqual([]);
    });
});