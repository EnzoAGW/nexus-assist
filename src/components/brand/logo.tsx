import { cx } from "@/lib/cx";

export function Logo({ tone = "dark" }: { tone?: "dark" | "light" }) {
    return (
        <div className="flex items-center gap-2.5">
            <span
                aria-hidden="true"
                className={cx(
                    "grid size-8 place-items-center rounded-lg text-base font-bold",
                    tone === "light" ? "bg-white text-night-900" : "bg-brand-600 text-white",
                )}
            >
                N
            </span>
            <span className={cx("text-base font-semibold tracking-tight", tone === "light" ? "text-white" : "text-slate-900")}>
                Nexo Assist
            </span>
        </div>
    );
}