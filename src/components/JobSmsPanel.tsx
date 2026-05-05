"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MANUAL_TEMPLATES, type ManualTemplateKey } from "@/lib/sms-templates";

type Props = { jobId: string };

export default function JobSmsPanel({ jobId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | string>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customMsg, setCustomMsg] = useState("");

  async function send(template: ManualTemplateKey, customText?: string) {
    setBusy(template);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/sms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ template, custom_message: customText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send");
      setSuccess(
        data.delivery_status === "skipped_not_configured"
          ? "Twilio not configured — SMS logged but not sent."
          : `Sent. Status: ${data.delivery_status}.`
      );
      if (template === "custom") { setCustomMsg(""); setShowCustom(false); }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--navy)", marginBottom: 4 }}>
        SMS the client
      </h3>
      <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 12 }}>
        Tap a template — the client&apos;s first name fills in automatically.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {MANUAL_TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => send(t.key)}
            disabled={busy !== null}
            style={btnRow}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: "var(--navy)", fontSize: 14 }}>{t.label}</div>
              <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 2 }}>{t.description}</div>
            </div>
            <span style={{ fontSize: 12, color: "var(--gray)" }}>
              {busy === t.key ? "Sending…" : "Send →"}
            </span>
          </button>
        ))}

        {!showCustom ? (
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            style={{ ...btnRow, justifyContent: "center" }}
            disabled={busy !== null}
          >
            <span style={{ fontWeight: 700, color: "var(--navy)" }}>+ Custom message</span>
          </button>
        ) : (
          <div style={btnRow}>
            <div style={{ flex: 1 }}>
              <textarea
                value={customMsg}
                onChange={(e) => setCustomMsg(e.target.value)}
                rows={3}
                maxLength={1500}
                className="form-textarea"
                placeholder="Type your message — sent from the Twilio number on file."
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => send("custom", customMsg)}
                  disabled={busy !== null || !customMsg.trim()}
                  style={primaryBtn}
                >
                  {busy === "custom" ? "Sending…" : "Send custom"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCustom(false); setCustomMsg(""); }}
                  style={cancelBtn}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && <div className="form-error" role="alert" style={{ marginTop: 8 }}>⚠ {error}</div>}
      {success && (
        <div role="status" style={{
          marginTop: 8, padding: 10,
          background: "rgba(34,134,58,0.10)", color: "#15803D",
          borderRadius: 8, fontSize: 13, fontWeight: 600,
        }}>
          ✓ {success}
        </div>
      )}
    </div>
  );
}

const btnRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  background: "var(--off)", borderRadius: 10,
  padding: 12, border: "none", cursor: "pointer",
  textAlign: "left", minHeight: 44,
};
const primaryBtn: React.CSSProperties = {
  background: "var(--navy)", color: "white",
  border: "none", borderRadius: 8,
  padding: "10px 16px", fontSize: 14, fontWeight: 700,
  cursor: "pointer", minHeight: 40,
};
const cancelBtn: React.CSSProperties = {
  background: "transparent", color: "var(--gray)",
  border: "none", padding: "10px 16px", fontSize: 13,
  cursor: "pointer", minHeight: 40,
};
