export interface Inline {
    text: string;
    bold: boolean;
}
export type Block = { type: "p"; lines: Inline[][] } | { type: "ul"; items: Inline[][] };

export function parseInline(line: string): Inline[] {
    const out: Inline[] = [];
    let last = 0;
    for (const m of line.matchAll(/\*\*(.+?)\*\*/g)) {
        const index = m.index ?? 0;
        if (index > last) out.push({ text: line.slice(last, index), bold: false });
        out.push({ text: m[1]!, bold: true });
        last = index + m[0].length;
    }
    if (last < line.length) out.push({ text: line.slice(last), bold: false });
    return out;
}

/**
 * Subconjunto de Markdown que o modelo costuma produzir: negrito, listas e quebras.
 * O resultado é dado, não HTML: a tela só renderiza nós de texto, então nada do modelo vira marcação.
 */
export function parseMarkdown(text: string): Block[] {
    const blocks: Block[] = [];
    let para: Inline[][] = [];
    let list: Inline[][] = [];

    const flushPara = () => {
        if (para.length > 0) blocks.push({ type: "p", lines: para });
        para = [];
    };
    const flushList = () => {
        if (list.length > 0) blocks.push({ type: "ul", items: list });
        list = [];
    };

    for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
        const line = raw.trimEnd();
        if (!line.trim()) {
            flushPara();
            flushList();
            continue;
        }
        const item = /^\s*[*-]\s+(.*)$/.exec(line);
        if (item) {
            flushPara();
            list.push(parseInline(item[1]!.trim()));
            continue;
        }
        flushList();
        const heading = /^#{1,6}\s+(.*)$/.exec(line);
        para.push(heading ? [{ text: heading[1]!, bold: true }] : parseInline(line.trim()));
    }
    flushPara();
    flushList();
    return blocks;
}