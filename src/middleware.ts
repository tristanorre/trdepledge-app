import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Edge middleware that gates /admin and /worker. Page-level
// requireAdmin/requireWorker calls are still the source of truth; this just
// shortcuts the round-trip and provides a fast redirect for unauth requests.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin") && token.role !== "admin") {
    return NextResponse.redirect(new URL("/worker", req.url));
  }
  if (pathname.startsWith("/worker") && token.role !== "worker") {
    return NextResponse.redirect(new URL("/admin", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/worker/:path*"],
};
