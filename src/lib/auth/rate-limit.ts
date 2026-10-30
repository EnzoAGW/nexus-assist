export interface RateLimiterOptions {
  maxFailures: number;
  windowMs: number;
  now?: () => number;
}

export type RateCheck = { allowed: true } | { allowed: false; retryAfterSeconds: number };

const SWEEP_THRESHOLD = 5_000;

/** Janela deslizante de tentativas FALHAS. Em memória: suficiente para uma instância. */
export function createRateLimiter(options: RateLimiterOptions) {
  const now = options.now ?? Date.now;
  const failures = new Map<string, number[]>();

  const recent = (key: string): number[] => {
    const cutoff = now() - options.windowMs;
    const list = (failures.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length > 0) failures.set(key, list);
    else failures.delete(key);
    return list;
  };

  return {
    check(key: string): RateCheck {
      const list = recent(key);
      if (list.length < options.maxFailures) return { allowed: true };
      const oldest = list[0]!;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + options.windowMs - now()) / 1000));
      return { allowed: false, retryAfterSeconds };
    },

    recordFailure(key: string): void {
      if (failures.size > SWEEP_THRESHOLD) for (const k of [...failures.keys()]) recent(k); // evita crescer sem limite
      const list = recent(key);
      list.push(now());
      failures.set(key, list);
    },

    reset(key: string): void {
      failures.delete(key);
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;