import { describe, expect, it } from "vitest";
import { formatWait, submitLogin, validateLogin } from "./login";

const input = { email: "ana.souza@nexo.com.br", password: "x", remember: false };
const respond = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  (async () => new Response(JSON.stringify(body), { status, headers })) as unknown as typeof fetch;

describe("validateLogin", () => {
  it("pede o que falta, na ordem", () => {
    expect(validateLogin({ email: "", password: "" })).toBe("Informe o e-mail corporativo.");
    expect(validateLogin({ email: "ana", password: "x" })).toBe("Esse e-mail não parece válido.");
    expect(validateLogin({ email: "ana@nexo.com.br", password: "" })).toBe("Informe a senha.");
    expect(validateLogin({ email: " ana@nexo.com.br ", password: "x" })).toBeNull();
  });
});

describe("submitLogin", () => {
  it("sucesso: navega para o destino informado, só se for conhecido", async () => {
    expect(await submitLogin(input, respond(200, { redirectTo: "/console" }))).toEqual({ ok: true, redirectTo: "/console" });
    expect(await submitLogin(input, respond(200, { redirectTo: "https://malicioso.example" }))).toEqual({ ok: true, redirectTo: "/chat" });
    expect(await submitLogin(input, respond(200, "lixo"))).toEqual({ ok: true, redirectTo: "/chat" });
  });

  it("credenciais inválidas: mensagem única, sem revelar se o e-mail existe", async () => {
    expect(await submitLogin(input, respond(401))).toMatchObject({ ok: false, kind: "invalid", message: "E-mail ou senha inválidos." });
  });

  it("429: informa quando tentar de novo", async () => {
    const result = await submitLogin(input, respond(429, {}, { "Retry-After": "90" }));
    expect(result).toMatchObject({ ok: false, kind: "rate_limited" });
    expect(!result.ok && result.message).toContain("2 minutos");
  });

  it("429 sem Retry-After ainda tem mensagem útil", async () => {
    const result = await submitLogin(input, respond(429));
    expect(!result.ok && result.message).toContain("Aguarde");
  });

  it("falha de rede e erro do servidor são tipos diferentes", async () => {
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await submitLogin(input, offline)).toMatchObject({ ok: false, kind: "network" });
    expect(await submitLogin(input, respond(500))).toMatchObject({ ok: false, kind: "server" });
  });

  it("envia o e-mail sem espaços e o 'manter conectado'", async () => {
    let sent = "";
    const spy = (async (_url: unknown, init?: RequestInit) => {
      sent = String(init?.body);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await submitLogin({ email: "  ana.souza@nexo.com.br ", password: "x", remember: true }, spy);
    expect(JSON.parse(sent)).toEqual({ email: "ana.souza@nexo.com.br", password: "x", remember: true });
  });
});

describe("formatWait", () => {
  it("segundos e minutos, no singular e no plural", () => {
    expect(formatWait(1)).toBe("1 segundo");
    expect(formatWait(45)).toBe("45 segundos");
    expect(formatWait(60)).toBe("1 minuto");
    expect(formatWait(61)).toBe("2 minutos");
  });
});