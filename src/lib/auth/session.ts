import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { userRoleSchema } from "@/lib/domain/model/schemas";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "nexo_session";
export const SHORT_SESSION_SECONDS = 8 * 60 * 60; // 8h
export const REMEMBER_SESSION_SECONDS = 30 * 24 * 60 * 60; // 30 dias

const payloadSchema = z.object({ email: z.string().email(), role: userRoleSchema });
export type SessionPayload = z.infer<typeof payloadSchema>;

const secretKey = () => new TextEncoder().encode(env.SESSION_SECRET);

export async function signSession(payload: SessionPayload, remember: boolean, now = new Date()): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const ttl = remember ? REMEMBER_SESSION_SECONDS : SHORT_SESSION_SECONDS;
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttl)
    .sign(secretKey());
}

/** Qualquer problema (assinatura, expiração, formato) vira `null`: nunca lança. */
export async function verifySession(token: string, now = new Date()): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"], currentDate: now });
    const parsed = payloadSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}