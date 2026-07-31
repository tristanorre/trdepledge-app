import ChangePinForm from "@/components/ChangePinForm";

// Blocking screen shown instead of the worker app when
// users.must_change_pin is true — i.e. the worker is still on the
// temporary PIN an admin seeded for them.
//
// Rendered by the worker layout, so it covers EVERY worker route.
// There's deliberately no skip / dismiss: the flag only clears when
// /api/worker/me/pin succeeds, and that endpoint rejects weak PINs
// (including the 1234 default), so the worker can't no-op their way
// past it.

export default function ForcePinChangeScreen({ name }: { name: string }) {
  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 40, marginBottom: 8, textAlign: "center" }}>🔒</div>
        <h1 style={titleStyle}>Set your PIN, {name.split(/\s+/)[0]}</h1>
        <p style={leadStyle}>
          You&apos;re signed in with the temporary PIN Thomas set up for you.
          Pick your own 4-digit PIN before you carry on — it&apos;s what
          you&apos;ll use to sign in from now on.
        </p>

        <div style={noteStyle}>
          Enter <strong>1234</strong> as your current PIN, then choose a new one.
          Avoid obvious picks — repeated digits (1111) and simple runs (1234, 4321)
          are blocked.
        </div>

        <ChangePinForm />
      </div>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  minHeight: "100dvh",
  display: "flex", alignItems: "flex-start", justifyContent: "center",
  background: "var(--off)",
  padding: "32px 20px",
};
const cardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  padding: "28px 24px",
  maxWidth: 420, width: "100%",
  boxShadow: "0 6px 24px rgba(0,0,0,0.10)",
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 26, color: "var(--navy)",
  lineHeight: 1.15, marginBottom: 8, textAlign: "center",
};
const leadStyle: React.CSSProperties = {
  fontSize: 14, color: "var(--gray)", lineHeight: 1.6,
  marginBottom: 16, textAlign: "center",
};
const noteStyle: React.CSSProperties = {
  fontSize: 13, color: "#857200", lineHeight: 1.5,
  background: "rgba(255,229,0,0.16)",
  border: "1px solid rgba(133,114,0,0.18)",
  borderRadius: 10, padding: "10px 12px",
  marginBottom: 20,
};
