"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { INITIAL_LIVE, liveReducer, selectLive } from "@/lib/client/live-resource";

/** Repete `callback` a cada `ms`. Não acumula chamadas e pausa com a aba oculta. */
export function usePolling(callback: () => Promise<void> | void, ms: number, enabled: boolean): void {
    const saved = useRef(callback);
    useEffect(() => {
        saved.current = callback;
    }, [callback]);

    useEffect(() => {
        if (!enabled) return;
        let running = false;
        const id = setInterval(async () => {
            if (running || document.hidden) return;
            running = true;
            try {
                await saved.current();
            } finally {
                running = false;
            }
        }, ms);
        return () => clearInterval(id);
    }, [ms, enabled]);
}

/** Relógio que renova os "há 5 min" sem nova consulta. */
export function useNow(ms = 30_000): Date {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), ms);
        return () => clearInterval(id);
    }, [ms]);
    return now;
}

export function useDebounced<T>(value: T, ms: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), ms);
        return () => clearTimeout(id);
    }, [value, ms]);
    return debounced;
}

/** Acompanha o fim da lista, mas só enquanto o analista não rolou para cima. */
export function useStickyScroll(dependency: unknown) {
    const scroller = useRef<HTMLDivElement>(null);
    const end = useRef<HTMLDivElement>(null);
    const stick = useRef(true);

    const onScroll = useCallback(() => {
        const el = scroller.current;
        if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    }, []);

    useEffect(() => {
        if (stick.current) end.current?.scrollIntoView({ block: "end" });
    }, [dependency]);

    return { scroller, end, onScroll };
}

export function useLiveResource<T>(opts: {
    key: string | null;
    fetcher: (key: string) => Promise<T>;
    intervalMs: number;
    pollEnabled?: boolean;
    keepPrevious?: boolean;
}) {
    const { key, fetcher, intervalMs, pollEnabled = true, keepPrevious = false } = opts;
    const [state, dispatch] = useReducer(liveReducer<T>, INITIAL_LIVE);

    const seq = useRef(0);
    const fetcherRef = useRef(fetcher);
    useEffect(() => {
        fetcherRef.current = fetcher;
    });

    const reload = useCallback(async () => {
        if (key === null) return;
        const mine = ++seq.current;
        try {
            const data = await fetcherRef.current(key);
            if (mine === seq.current) dispatch({ type: "ok", key, data });
        } catch (error) {
            if (mine === seq.current) dispatch({ type: "fail", key, error });
        }
    }, [key]);

    useEffect(() => {
        void reload();
    }, [reload]);
    usePolling(reload, intervalMs, pollEnabled && key !== null);

    return { ...selectLive(state, key, keepPrevious), reload };
}