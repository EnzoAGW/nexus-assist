import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

const homeFor = (role: "employee" | "analyst") => (role === "analyst" ? "/console" : "/chat");
const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

 
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  const redirect = (to: string) => NextResponse.redirect(new URL(to, req.url));

  if (pathname === "/login") return session ? redirect(homeFor(session.role)) : NextResponse.next();
  if (!session) return redirect("/login");

  if (under(pathname, "/console") && session.role !== "analyst") return redirect(homeFor(session.role));
  if ((under(pathname, "/chat") || under(pathname, "/perfil")) && session.role !== "employee") {
    return redirect(homeFor(session.role));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/login", "/chat/:path*", "/perfil/:path*", "/console/:path*"] };