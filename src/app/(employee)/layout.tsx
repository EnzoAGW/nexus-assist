import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/guards";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    if (user.role !== "employee") redirect("/console");
    return <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>;
}