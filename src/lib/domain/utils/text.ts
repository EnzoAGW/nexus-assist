const STOPWORDS = new Set(
    (
        "a o as os um uma uns umas de do da dos das no na nos nas em ao aos para pra por com sem e ou que se mas " +
        "ja eu me meu minha meus minhas nosso nossa ele ela eles elas voce nao esta estou estao foi ser sao tem ter " +
        "tinha muito mais ainda depois apos antes como quando onde isso isto esse essa este aqui la hoje preciso " +
        "quero gostaria favor oi ola obrigado obrigada"
    ).split(" "),
);

/** minúsculas, sem acentos, só letras e números. */
export function normalize(text: string): string {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

/** Tira o plural e trunca em 6 letras: "conecta" e "conectar" viram "conect". */
export function stem(token: string): string {
    const t = token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token;
    return t.length > 6 ? t.slice(0, 6) : t;
}

export function tokenize(text: string): string[] {
    return normalize(text)
        .split(" ")
        .filter((t) => t.length > 1 && !STOPWORDS.has(t))
        .map(stem);
}