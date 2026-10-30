import { ResetPasswordButton } from "@/features/profile/reset-password-button";
import { getCurrentUser } from "@/lib/auth/guards";
import { daysSince, formatPasswordAge } from "@/lib/client/format";
import { services } from "@/services";

export const metadata = { title: "Meu perfil · Nexo Assist" };

export default async function ProfilePage() {
    const user = await getCurrentUser();
    if (!user) return null; // o layout já redirecionou
    const changedAt = await services.users.getPasswordChangedAt(user.email);

    return (
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
            <h1 className="text-2xl font-semibold tracking-tight">Meu perfil</h1>
            <p className="mt-1 text-sm text-slate-600">Seus dados de acesso ao service desk de TI.</p>

            <dl className="mt-8 divide-y divide-slate-200 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <dt className="text-sm text-slate-500">Nome</dt>
                    <dd className="text-sm font-medium">{user.name}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <dt className="text-sm text-slate-500">E-mail corporativo</dt>
                    <dd className="text-sm font-medium">
                        {user.email} <span className="ml-2 text-xs font-normal text-slate-400">gerenciado pelo TI</span>
                    </dd>
                </div>
            </dl>

            <section aria-labelledby="senha" className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-5 py-4">
                <div>
                    <h2 id="senha" className="text-sm font-medium">Senha</h2>
                    <p className="mt-0.5 text-sm text-slate-500">{changedAt ? formatPasswordAge(daysSince(changedAt, new Date())) : "Data da última alteração indisponível"}</p>
                </div>
                <ResetPasswordButton />
            </section>
        </div>
    );
}