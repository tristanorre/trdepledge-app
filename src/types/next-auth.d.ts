import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email?: string | null;
      role: "admin" | "worker";
    };
  }

  interface User {
    id: string;
    name: string;
    email?: string | null;
    role: "admin" | "worker";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    role: "admin" | "worker";
  }
}
