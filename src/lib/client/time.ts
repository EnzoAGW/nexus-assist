const TZ = "America/Sao_Paulo";

export function relativeTime(iso: string, now: Date): string {
    const then = new Date(iso);
    const minutes = Math.floor(Math.max(0, now.getTime() - then.getTime()) / 60_000);
    if (minutes < 1) return "agora";
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "ontem";
    if (days < 7) return `há ${days} dias`;
    return then.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
}

export const clockTime = (iso: string): string =>
    new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });