import type { Tone } from "@/lib/client/console-rules";

export const TONE_DOT: Record<Tone, string> = {
    red: "bg-red-500",
    amber: "bg-amber-500",
    blue: "bg-brand-600",
    green: "bg-emerald-500",
    slate: "bg-slate-400",
};

export const TONE_PILL: Record<Tone, string> = {
    red: "bg-red-50 text-red-700 ring-red-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    blue: "bg-brand-50 text-brand-700 ring-brand-100",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
};