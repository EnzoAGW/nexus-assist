const OFFSET_MS = -3 * 60 * 60 * 1000; // America/Sao_Paulo (UTC-3, sem horário de verão)
const HOUR_MS = 60 * 60 * 1000;

export const BUSINESS_START_HOUR = 8;
export const BUSINESS_END_HOUR = 18;
export const BUSINESS_HOURS_PER_DAY = BUSINESS_END_HOUR - BUSINESS_START_HOUR;

// "Hora local": um Date deslocado, lido SEMPRE com getUTC*.
const toLocal = (d: Date): Date => new Date(d.getTime() + OFFSET_MS);
const fromLocal = (l: Date): Date => new Date(l.getTime() - OFFSET_MS);

const isBusinessDay = (l: Date): boolean => {
  const day = l.getUTCDay();
  return day >= 1 && day <= 5;
};

const atHour = (l: Date, hour: number): Date => {
  const d = new Date(l);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

/** 8h do próximo dia útil, estritamente depois do dia de `l`. */
function nextBusinessDayStart(l: Date): Date {
  const d = atHour(l, BUSINESS_START_HOUR);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (!isBusinessDay(d));
  return d;
}

/** Se `l` está fora do expediente, move para o início do próximo expediente. */
function normalize(l: Date): Date {
  if (!isBusinessDay(l)) return nextBusinessDayStart(l);
  const minutes = l.getUTCHours() * 60 + l.getUTCMinutes();
  if (minutes < BUSINESS_START_HOUR * 60) return atHour(l, BUSINESS_START_HOUR);
  if (minutes >= BUSINESS_END_HOUR * 60) return nextBusinessDayStart(l);
  return new Date(l);
}

/**
 * Soma horas úteis a partir de `start`. Começar fora do expediente conta a partir
 * da próxima abertura. Um dia útil = 10 horas úteis.
 */
export function addBusinessHours(start: Date, hours: number): Date {
  let cur = normalize(toLocal(start));
  let remaining = hours * HOUR_MS;

  for (;;) {
    const available = atHour(cur, BUSINESS_END_HOUR).getTime() - cur.getTime();
    if (remaining <= available) {
      return fromLocal(new Date(cur.getTime() + remaining));
    }
    remaining -= available;
    cur = nextBusinessDayStart(cur);
  }
}