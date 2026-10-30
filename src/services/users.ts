import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import type { Db } from "@/db/types";
import type { User } from "@/lib/domain/model/schemas";
import { RuleError } from "./errors";

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export function createUserService(db: Db) {
  async function findByEmail(email: string): Promise<User | null> {
    const [row] = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
    return row ? { email: row.email, name: row.name, role: row.role, level: row.level } : null;
  }

  /** Autorização no servidor: quem usa funções de analista precisa ser analista no banco. */
  async function requireAnalyst(email: string): Promise<User> {
    const user = await findByEmail(email);
    if (!user || user.role !== "analyst") {
      throw new RuleError("analyst_required", "Ação restrita a analistas do service desk.");
    }
    return user;
  }

  async function authenticate(email: string, password: string): Promise<User | null> {
    if (password.length === 0) return null;
    return findByEmail(email);
  }

  async function isAvailable(email: string): Promise<boolean> {
    const [row] = await db.select({ available: users.available }).from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
    return row?.available ?? false;
  }

  async function setAvailability(email: string, available: boolean): Promise<void> {
    const analyst = await requireAnalyst(email);
    await db.update(users).set({ available }).where(eq(users.email, analyst.email));
  }
  return { findByEmail, requireAnalyst, authenticate, isAvailable, setAvailability };
}

export type UserService = ReturnType<typeof createUserService>;