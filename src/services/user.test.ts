import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, insertUser, type TestDb } from "@/db/test-utils";
import { createUserService } from "./users";

let ctx: TestDb;

beforeEach(async () => {
  ctx = await createTestDb();
  await insertUser(ctx.db, { email: "ana.souza@nexo.com.br", name: "Ana Souza" });
  await insertUser(ctx.db, { email: "rafael.lima@nexo.com.br", name: "Rafael Lima", role: "analyst", level: "N2" });
});

afterEach(async () => {
  await ctx.cleanup();
});

describe("authenticate (demo)", () => {
  it("aceita usuário do seed com qualquer senha, sem diferenciar maiúsculas no e-mail", async () => {
    const users = createUserService(ctx.db);
    expect((await users.authenticate("Ana.Souza@Nexo.com.br", "qualquer"))?.name).toBe("Ana Souza");
  });

  it("recusa e-mail desconhecido e senha vazia", async () => {
    const users = createUserService(ctx.db);
    expect(await users.authenticate("intruso@nexo.com.br", "x")).toBeNull();
    expect(await users.authenticate("ana.souza@nexo.com.br", "")).toBeNull();
  });

  it("devolve o papel real do banco", async () => {
    const users = createUserService(ctx.db);
    expect((await users.authenticate("rafael.lima@nexo.com.br", "x"))?.role).toBe("analyst");
  });
  it("devolve a data da última troca de senha", async () => {
    const at = await createUserService(ctx.db).getPasswordChangedAt("ANA.souza@nexo.com.br");
    expect(at).toBeInstanceOf(Date);
  });
});