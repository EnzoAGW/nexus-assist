import { clearSessionCookie } from "@/lib/auth/cookies";

export async function POST(): Promise<Response> {
  await clearSessionCookie();
  return new Response(null, { status: 204 });
}