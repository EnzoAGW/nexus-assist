import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "./session";

const payload = { email: "ana.souza@nexo.com.br", role: "employee" } as const;
const NOW = new Date("2026-10-28T12:00:00Z");
const hoursLater = (h: number) => new Date(NOW.getTime() + h * 60 * 60 * 1000);

describe("sessão", () => {
  it("ida e volta preserva e-mail e papel", async () => {
    const token = await signSession(payload, false, NOW);
    expect(await verifySession(token, NOW)).toEqual(payload);
  });

  it("sessão curta expira em 8h; 'manter conectado' dura dias", async () => {
    const short = await signSession(payload, false, NOW);
    const long = await signSession(payload, true, NOW);
    expect(await verifySession(short, hoursLater(7))).not.toBeNull();
    expect(await verifySession(short, hoursLater(9))).toBeNull();
    expect(await verifySession(long, hoursLater(24 * 29))).not.toBeNull();
    expect(await verifySession(long, hoursLater(24 * 31))).toBeNull();
  });

  it("rejeita token adulterado", async () => {
    const token = await signSession(payload, false, NOW);
    const [h, p, s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, role: "analyst" })).toString("base64url");
    expect(await verifySession(`${h}.${forged}.${s}`, NOW)).toBeNull();
    expect(p).not.toBe(forged);
  });

  it("rejeita lixo", async () => {
    expect(await verifySession("isto-nao-e-um-jwt", NOW)).toBeNull();
    expect(await verifySession("", NOW)).toBeNull();
  });
});