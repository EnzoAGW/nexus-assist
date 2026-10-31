/**
 * Dado remoto que se atualiza sozinho. O dado e o erro guardam a CHAVE a que pertencem:
 * ao trocar de chave, o que sobrou da anterior é descartado na leitura (não em um efeito).
 */
export interface LiveState<T> {
    dataKey: string | null;
    data: T | null;
    errorKey: string | null;
    error: unknown;
}

export const INITIAL_LIVE: LiveState<never> = { dataKey: null, data: null, errorKey: null, error: null };

export type LiveAction<T> =
    | { type: "ok"; key: string; data: T }
    | { type: "fail"; key: string; error: unknown };

export function liveReducer<T>(state: LiveState<T>, action: LiveAction<T>): LiveState<T> {
    switch (action.type) {
        case "ok":
            return { dataKey: action.key, data: action.data, errorKey: null, error: null };
        case "fail":
            // Falhar não apaga o que já estava na tela: a próxima consulta tenta de novo.
            return { ...state, errorKey: action.key, error: action.error };
    }
}

export function selectLive<T>(
    state: LiveState<T>,
    key: string | null,
    keepPrevious: boolean,
): { data: T | null; error: unknown } {
    const data = keepPrevious || state.dataKey === key ? state.data : null;
    const error = state.errorKey === key ? state.error : null;
    return { data, error };
}