import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";
import type { Db } from "./types";

export interface TestDb {
  db: Db;
  cleanup: () => void;
}

export async function createTestDb(): Promise<TestDb> {
  const file = `./data/test-${randomUUID()}.db`;
  const client = createClient({ url: `file:${file}` });
  await client.execute("PRAGMA foreign_keys = ON");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });

  return {
    db,
    cleanup: async () => {
      client.close();

      await Promise.allSettled(["", "-wal", "-shm"].map((suffix) => rm(`${file}${suffix}`, { force: true })));
    },
  };
}

export async function insertUser(
  db: Db,
  u: { email: string; name: string; role?: "employee" | "analyst"; level?: "N1" | "N2" | null },
): Promise<void> {
  await db.insert(schema.users).values({
    email: u.email,
    name: u.name,
    role: u.role ?? "employee",
    level: u.level ?? null,
    available: true,
    passwordChangedAt: new Date(),
  });
}

type TicketInsert = typeof schema.tickets.$inferInsert;

export async function insertTicket(
  db: Db,
  t: Partial<TicketInsert> & Pick<TicketInsert, "id" | "requesterEmail">,
): Promise<void> {
  const base: Omit<TicketInsert, "id" | "requesterEmail"> = {
    title: "Notebook lento após atualização do Windows",
    description: "Descrição de teste com mais de vinte caracteres.",
    type: "INC",
    category: "Hardware",
    priority: "medium",
    impact: "single",
    status: "open",
    createdAt: new Date(),
    lastUpdatedAt: new Date(),
    resolvedAt: null,
  };
  await db.insert(schema.tickets).values({ ...base, ...t });
}