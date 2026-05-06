import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase";

// Two credential paths share one provider so the login form can submit
// either an admin {mode:"admin",email,password} or a worker
// {mode:"worker",worker_id,pin} payload.
//
// Workers select their name from a list before entering the PIN — the
// PIN alone (4 digits) is not unique. Selection narrows to one user;
// bcrypt verifies the PIN against that user's pin_hash.
//
// Lockout (added Slice 9): after MAX_FAILED consecutive failures the
// account is locked for LOCKOUT_MINUTES. Mitigates the small PIN
// keyspace — without it, 10 000 combos × 80ms bcrypt cost = ~13 min
// of online guessing per worker.
const MAX_FAILED = 5;
const LOCKOUT_MINUTES = 15;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 /* 14 days */ },
  pages: { signIn: "/login" },

  providers: [
    CredentialsProvider({
      name: "TR Depledge Login",
      credentials: {
        mode:      { label: "Mode",      type: "text" },
        email:     { label: "Email",     type: "email" },
        password:  { label: "Password",  type: "password" },
        worker_id: { label: "Worker ID", type: "text" },
        pin:       { label: "PIN",       type: "password" },
      },
      async authorize(credentials) {
        const supabase = getServiceClient();
        if (!supabase) {
          // Without DB credentials we cannot authenticate. Surface a
          // meaningful error to the login form rather than silently failing.
          throw new Error("Auth backend not configured");
        }

        const mode = credentials?.mode;

        if (mode === "admin") {
          const email = credentials?.email?.trim().toLowerCase();
          const password = credentials?.password ?? "";
          if (!email || !password) return null;

          const { data: user, error } = await supabase
            .from("users")
            .select("id, name, email, role, password_hash, active, failed_login_attempts, locked_until")
            .eq("email", email)
            .eq("role", "admin")
            .eq("active", true)
            .maybeSingle();
          if (error || !user || !user.password_hash) return null;

          if (isLocked(user.locked_until)) {
            throw new Error("Account locked. Try again in 15 minutes.");
          }

          const ok = await bcrypt.compare(password, user.password_hash);
          if (!ok) {
            await recordFailure(supabase, user.id, user.failed_login_attempts);
            return null;
          }

          await resetFailures(supabase, user.id);
          return { id: user.id, name: user.name, email: user.email, role: "admin" };
        }

        if (mode === "worker") {
          // `worker_id` from the form is now a `public_slug` (see
          // migration 0017 + /api/auth/workers/route.ts). It's still
          // posted under the `worker_id` field name to keep the
          // credentials-provider config stable. Old code paths that
          // pass a real UUID continue to work as a fallback while the
          // backfill rolls out.
          const workerKey = credentials?.worker_id;
          const pin = credentials?.pin ?? "";
          if (!workerKey || !pin || !/^\d{4}$/.test(pin)) return null;

          const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workerKey);
          const lookup = supabase
            .from("users")
            .select("id, name, role, pin_hash, active, failed_login_attempts, locked_until")
            .eq("role", "worker")
            .eq("active", true);
          const { data: user, error } = await (looksLikeUuid
            ? lookup.eq("id", workerKey).maybeSingle()
            : lookup.eq("public_slug", workerKey).maybeSingle());
          if (error || !user || !user.pin_hash) return null;

          if (isLocked(user.locked_until)) {
            throw new Error("Account locked. Try again in 15 minutes.");
          }

          const ok = await bcrypt.compare(pin, user.pin_hash);
          if (!ok) {
            await recordFailure(supabase, user.id, user.failed_login_attempts);
            return null;
          }

          await resetFailures(supabase, user.id);
          return { id: user.id, name: user.name, email: null, role: "worker" };
        }

        return null;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) {
        session.user = {
          ...session.user,
          id: token.uid,
          role: token.role,
        };
      }
      return session;
    },
  },
};

function isLocked(locked_until: string | null): boolean {
  if (!locked_until) return false;
  return new Date(locked_until).getTime() > Date.now();
}

async function recordFailure(supabase: SupabaseClient, userId: string, currentFailures: number): Promise<void> {
  const next = currentFailures + 1;
  const patch: Record<string, unknown> = { failed_login_attempts: next };
  if (next >= MAX_FAILED) {
    patch.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString();
  }
  // Best-effort — if the update fails we still return null so login is
  // denied. The brute-force window widens slightly, not catastrophically.
  await supabase.from("users").update(patch).eq("id", userId).then(({ error }) => {
    if (error) console.error("[auth] recordFailure", error);
  });
}

async function resetFailures(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase
    .from("users")
    .update({ failed_login_attempts: 0, locked_until: null })
    .eq("id", userId)
    .then(({ error }) => {
      if (error) console.error("[auth] resetFailures", error);
    });
}
