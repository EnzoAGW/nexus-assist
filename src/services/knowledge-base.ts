import { eq } from "drizzle-orm";
import { articles } from "@/db/schema";
import type { Db } from "@/db/types";
import { normalize, tokenize } from "@/lib/domain/text";

export type Article = typeof articles.$inferSelect;

export interface RankedArticle {
    article: Article;
    score: number;
    /** Palavras-chave que casaram. Alimenta a transparência. */
    matchedTerms: string[];
}

/** Abaixo disso, a coincidência é ruído e o agent deve tratar como "sem resposta na central". */
export const MIN_SCORE = 3;

export function rankArticles(query: string, list: readonly Article[], limit = 3): RankedArticle[] {
    const queryTokens = new Set(tokenize(query));
    if (queryTokens.size === 0) return [];

    const ranked: RankedArticle[] = [];

    for (const article of list) {
        let score = 0;
        const matchedTerms: string[] = [];

        for (const phrase of article.keywords.split(",").map(normalize).filter(Boolean)) {
            const phraseTokens = tokenize(phrase);
            if (phraseTokens.length > 0 && phraseTokens.every((t) => queryTokens.has(t))) {
                score += 3 * phraseTokens.length;
                matchedTerms.push(phrase);
            }
        }
        for (const token of new Set(tokenize(article.title))) if (queryTokens.has(token)) score += 2;
        for (const token of new Set(tokenize(article.content))) if (queryTokens.has(token)) score += 1;

        if (score >= MIN_SCORE) ranked.push({ article, score, matchedTerms });
    }

    return ranked.sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title)).slice(0, limit);
}

export function createKnowledgeBaseService(db: Db) {
    return {
        /** São poucos artigos, então carregamos todos. Em escala real: FTS5 ou embeddings. */
        async search(query: string, limit = 3): Promise<RankedArticle[]> {
            const all = await db.select().from(articles);
            return rankArticles(query, all, limit);
        },

        async getById(id: string): Promise<Article | null> {
            const [row] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
            return row ?? null;
        },
    };
}

export type KnowledgeBaseService = ReturnType<typeof createKnowledgeBaseService>;