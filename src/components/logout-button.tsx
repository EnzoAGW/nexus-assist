"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui/button";

export function LogoutButton({ className }: { className?: string }) {
    const router = useRouter();
    const [pending, setPending] = useState(false);

    async function logout() {
        setPending(true);
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } finally {
            router.replace("/login");
            router.refresh();
        }
    }

    return (
        <Button variant="ghost" loading={pending} onClick={logout} className={className}>
            Sair
        </Button>
    );
}