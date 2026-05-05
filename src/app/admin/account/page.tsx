import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import ChangePasswordForm from "@/components/ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function AdminAccountPage() {
  const session = await requireAdmin();

  return (
    <div>
      <Link href="/admin" style={backLinkStyle}>← Dashboard</Link>
      <h1 style={titleStyle}>Account</h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 20 }}>
        Signed in as <strong>{session.user.name}</strong> ({session.user.email}).
      </p>

      <div style={cardStyle}>
        <h2 style={sectionHeader}>Change password</h2>
        <p style={{ fontSize: 13, color: "var(--gray)", marginBottom: 16 }}>
          Verify your current password, then set a new one. Sessions stay
          signed in — you&apos;ll only need the new password the next time you log in.
        </p>
        <ChangePasswordForm />
      </div>
    </div>
  );
}

const backLinkStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--gray)", marginBottom: 8, display: "inline-block",
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 28, color: "var(--navy)",
  lineHeight: 1.1, marginBottom: 4,
};
const cardStyle: React.CSSProperties = {
  background: "white", borderRadius: 14, padding: 20,
  border: "1px solid rgba(0,0,0,0.06)",
};
const sectionHeader: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 20, color: "var(--navy)",
  marginBottom: 8,
};
