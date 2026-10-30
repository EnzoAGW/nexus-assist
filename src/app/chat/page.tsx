import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { getCurrentUser } from "@/lib/auth/guards";

export default async function ChatPlaceholder() {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    return (
        <main className="grid min-h-dvh place-items-center">
            <div className="text-center">
                <p className="text-lg font-medium">Olá, {user.name}.</p>
                <p className="mt-1 text-sm text-slate-500">O chat do funcionário entra no passo 7b.</p>
                <LogoutButton className="mt-4" />
            </div>
        </main>
    );
}