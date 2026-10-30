import { cookies } from "next/headers";
import { REMEMBER_SESSION_SECONDS, SESSION_COOKIE, signSession, verifySession, type SessionPayload } from "./session";

export async function getSession(): Promise<SessionPayload | null> {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    return token ? verifySession(token) : null;
}

export async function setSessionCookie(payload: SessionPayload, remember: boolean): Promise<void> {
    const token = await signSession(payload, remember);
    (await cookies()).set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        ...(remember ? { maxAge: REMEMBER_SESSION_SECONDS } : {}),
    });
}

export async function clearSessionCookie(): Promise<void> {
    (await cookies()).delete(SESSION_COOKIE);
}