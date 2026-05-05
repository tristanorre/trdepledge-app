import Link from "next/link";
import { requireWorker } from "@/lib/session";
import ChangePinForm from "@/components/ChangePinForm";

export const dynamic = "force-dynamic";

export default async function WorkerAccountPage() {
  const session = await requireWorker();

  return (
    <div>
      <Link href="/worker" style={backLinkStyle}>← My jobs</Link>
      <h1 style={titleStyle}>Account</h1>
      <p style={{ color: "var(--gray)", fontSize: 14, marginBottom: 20 }}>
        Signed in as <strong>{session.user.name}</strong>.
      </p>

      <div style={cardStyle}>
        <h2 style={sectionHeader}>Change PIN</h2>
        <p style={{ fontSize: 13, color: "var(--gray)", marginBottom: 16 }}>
          PINs are 4 digits. You&apos;ll need to enter the new PIN twice.
        </p>
        <ChangePinForm />
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
