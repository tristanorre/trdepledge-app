import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

// Server helpers used by App Router pages and route handlers.

export async function getSession() {
  return getServerSession(authOptions);
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/worker");
  return session;
}

export async function requireWorker() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role !== "worker") redirect("/admin");
  return session;
}
