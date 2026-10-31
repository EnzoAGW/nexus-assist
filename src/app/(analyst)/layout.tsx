import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";

export default async function AnalystLayout({ children }: { children: React.ReactNode }) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    if (user.role !== "analyst") redirect("/chat");
    return <>{children}</>;
}