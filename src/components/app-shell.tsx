"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { LogoutButton } from "@/components/logout-button";
import { cx } from "@/lib/cx";
import { initials } from "@/lib/client/format";

const NAV = [
    { href: "/chat", label: "Atendimento" },
    { href: "/perfil", label: "Meu perfil" },
] as const;

export function AppShell({ user, children }: { user: { name: string; email: string }; children: React.ReactNode }) {
    const pathname = usePathname();
    const current = NAV.find((n) => pathname.startsWith(n.href));

    return (
        <div className="flex h-dvh">
            <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-slate-50 md:flex">
                <div className="px-5 py-5">
                    <Logo />
                </div>
                <nav aria-label="Principal" className="flex-1 space-y-1 px-3">
                    {NAV.map((n) => (
                        <Link
                            key={n.href}
                            href={n.href}
                            aria-current={pathname.startsWith(n.href) ? "page" : undefined}
                            className={cx(
                                "block rounded-lg px-3 py-2 text-sm font-medium",
                                pathname.startsWith(n.href) ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100",
                            )}
                        >
                            {n.label}
                        </Link>
                    ))}
                </nav>
                <div className="flex items-center gap-3 border-t border-slate-200 p-4">
                    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                        {initials(user.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{user.name}</p>
                        <p className="truncate text-xs text-slate-500">{user.email}</p>
                    </div>
                    <LogoutButton className="h-8 px-2" />
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4 sm:px-6">
                    <p className="hidden text-sm text-slate-500 md:block">
                        Service desk de TI <span aria-hidden="true">›</span> <span className="font-medium text-slate-900">{current?.label}</span>
                    </p>
                    <div className="md:hidden">
                        <Logo />
                    </div>
                    <nav aria-label="Principal (móvel)" className="flex items-center gap-1 md:hidden">
                        {NAV.map((n) => (
                            <Link key={n.href} href={n.href} className={cx("rounded-lg px-2.5 py-1.5 text-sm", pathname.startsWith(n.href) ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600")}>
                                {n.label}
                            </Link>
                        ))}
                        <LogoutButton className="h-8 px-2" />
                    </nav>
                </header>
                <main className="min-h-0 flex-1">{children}</main>
            </div>
        </div>
    );
}