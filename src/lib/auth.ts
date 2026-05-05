import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getServiceClient } from "@/lib/supabase";

// Two credential paths share one provider so the login form can submit
// either an admin {mode:"admin",email,password} or a worker
// {mode:"worker",worker_id,pin} payload.
//
// Workers select their name from a list before entering the PIN — the
// PIN alone (4 digits) is not unique. Selection narrows to one user;
// bcrypt verifies the PIN against that user's pin_hash.
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
            .select("id, name, email, role, password_hash, active")
            .eq("email", email)
            .eq("role", "admin")
            .eq("active", true)
            .maybeSingle();
          if (error || !user || !user.password_hash) return null;

          const ok = await bcrypt.compare(password, user.password_hash);
          if (!ok) return null;

          return { id: user.id, name: user.name, email: user.email, role: "admin" };
        }

        if (mode === "worker") {
          const workerId = credentials?.worker_id;
          const pin = credentials?.pin ?? "";
          if (!workerId || !pin || !/^\d{4}$/.test(pin)) return null;

          const { data: user, error } = await supabase
            .from("users")
            .select("id, name, role, pin_hash, active")
            .eq("id", workerId)
            .eq("role", "worker")
            .eq("active", true)
            .maybeSingle();
          if (error || !user || !user.pin_hash) return null;

          const ok = await bcrypt.compare(pin, user.pin_hash);
          if (!ok) return null;

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
