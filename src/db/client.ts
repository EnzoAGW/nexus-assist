import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Reaproveita a conexão entre recargas do `next dev` (HMR).
const globalForDb = globalThis as unknown as { __libsql?: Client };

function createDbClient(): Client {
  const client = createClient({ url: env.DATABASE_URL });
  // Chaves estrangeiras valem a pena para garantir integridade; WAL melhora leitura concorrente.
  void client.execute("PRAGMA foreign_keys = ON");
  void client.execute("PRAGMA journal_mode = WAL");
  return client;
}

const client = globalForDb.__libsql ?? createDbClient();
if (process.env.NODE_ENV !== "production") globalForDb.__libsql = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
export { schema };