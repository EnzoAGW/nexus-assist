import { z } from "zod";
import { createRateLimiter, type RateLimiter } from "@/lib/auth/rate-limit";
import { setSessionCookie } from "@/lib/auth/cookies";
import { errorResponse } from "@/lib/http";
import { services } from "@/services/index";
import { normalizeEmail } from "@/services/users";

const bodySchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
  remember: z.boolean().default(false),
});

// Reaproveita o limitador entre recargas do `next dev`.
const g = globalThis as unknown as { __loginLimiter?: RateLimiter };
const limiter = (g.__loginLimiter ??= createRateLimiter({ maxFailures: 5, windowMs: 10 * 60_000 }));

const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

const GENERIC_ERROR = "E-mail ou senha inválidos."; // mesma mensagem para "não existe" e "senha errada"

export async function POST(req: Request): Promise<Response> {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: { code: "invalid_input", message: "Informe e-mail e senha." } }, { status: 400 });
    }
    const { email, password, remember } = parsed.data;

    const key = `${clientIp(req)}|${normalizeEmail(email)}`;
    const gate = limiter.check(key);
    if (!gate.allowed) {
      return Response.json(
        { error: { code: "rate_limited", message: "Muitas tentativas. Aguarde um pouco e tente de novo." } },
        { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds) } },
      );
    }

    const user = await services.users.authenticate(email, password);
    if (!user) {
      limiter.recordFailure(key);
      return Response.json({ error: { code: "invalid_credentials", message: GENERIC_ERROR } }, { status: 401 });
    }
    limiter.reset(key);

    // Novo login = nova sessão: o limite de 30 mensagens recomeça (a conversa continua a mesma).
    if (user.role === "employee") {
      const conversation = await services.conversations.getOrCreateForUser(user.email);
      await services.conversations.startSession(user.email, conversation.id);
    }

    await setSessionCookie({ email: user.email, role: user.role }, remember);
    return Response.json({
      user: { name: user.name, email: user.email, role: user.role },
      redirectTo: user.role === "analyst" ? "/console" : "/chat",
    });
  } catch (err) {
    return errorResponse(err);
  }
}