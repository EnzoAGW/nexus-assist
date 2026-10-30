import type { UserRole } from "@/lib/domain/model/enums";
import type { User } from "@/lib/domain/model/schemas";
import { AuthError } from "@/services/errors";
import { services } from "@/services/index";
import { getSession } from "./cookies";

export async function getCurrentUser(): Promise<User | null> {
    const session = await getSession();
    if (!session) return null;
    return services.users.findByEmail(session.email);
}

export async function requireUser(role?: UserRole): Promise<User> {
    const user = await getCurrentUser();
    if (!user) throw new AuthError(401, "Sessão ausente ou expirada.");
    if (role && user.role !== role) throw new AuthError(403, "Sem permissão para este recurso.");
    return user;
}