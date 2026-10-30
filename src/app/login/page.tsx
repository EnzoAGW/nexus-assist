import { env } from "@/lib/env";
import { BrandPanel } from "@/features/login/brand-panel";
import { LoginForm } from "@/features/login/login-form";

export const metadata = { title: "Entrar · Nexo Assist" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />
      <section className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex flex-1 items-center justify-center py-8">
          <LoginForm showDemoAccounts={env.SHOW_DEMO_ACCOUNTS === "true"} />
        </div>
        <footer className="flex justify-between text-xs text-slate-500">
          <span>© Nexo · Service desk de TI</span>
          <span>Privacidade e termos de uso</span>
        </footer>
      </section>
    </main>
  );
}