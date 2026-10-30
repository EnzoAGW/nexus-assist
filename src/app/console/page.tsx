import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { getCurrentUser } from "@/lib/auth/guards";

export default async function ConsolePlaceholder() {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    return (
        <main className="grid min-h-dvh place-items-center">
            <div className="text-center">
                <p className="text-lg font-medium">Console do analista · {user.name}</p>
                <p className="mt-1 text-sm text-slate-500">O console entra no passo 7c.</p>
                <LogoutButton className="mt-4" />
            </div>
        </main>
    );
}