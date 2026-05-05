import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { getSession } from "@/lib/session";
import { getServiceClient } from "@/lib/supabase";

// API-route auth guards. Each returns either a usable session or a
// pre-built error response — call sites do:
//
//   const auth = await requireApiAdmin();
//   if (auth instanceof NextResponse) return auth;
//   const { session } = auth;

export async function requireApiAdmin(): Promise<{ session: Session } | NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return { session };
}

export async function requireApiWorker(): Promise<{ session: Session } | NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "worker") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return { session };
}

// Returns the service-role Supabase client OR a 503 response if the
// backend is not configured. Saves boilerplate in every route handler.
export function requireSupabase() {
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }
  return supabase;
}
