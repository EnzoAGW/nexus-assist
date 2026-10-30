export const initials = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    const first = parts[0]![0]!;
    const last = parts.length > 1 ? parts[parts.length - 1]![0]! : "";
    return (first + last).toUpperCase();
};

export const daysSince = (date: Date, now: Date): number =>
    Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));

export const formatPasswordAge = (days: number): string =>
    days === 0 ? "Alterada hoje" : `Alterada há ${days} ${days === 1 ? "dia" : "dias"}`;