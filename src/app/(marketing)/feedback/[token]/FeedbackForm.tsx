"use client";

import { useState, useTransition } from "react";

// Two-stage form:
//   Stage 1 — 5-star picker. Tap a star, form auto-advances.
//     * 4-5 stars  → POST → server returns { redirect } → we navigate
//                    the browser straight to Google's write-review page.
//     * 1-3 stars  → reveal a "what could we have done better?"
//                    textarea + Submit. On submit, POST → shows a
//                    "thanks, Thomas will be in touch" panel.
//
// The API call stamps responded_at + rating so the token can't be
// reused. Optimistic-ish: we lock the UI while pending.

type Props = {
  token: string;
  firstName: string;
};

export default function FeedbackForm({ token, firstName }: Props) {
  const [rating, setRating]     = useState<number | null>(null);
  const [hover, setHover]       = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [stage, setStage]       = useState<"stars" | "negative" | "done">("stars");
  const [isPending, start]      = useTransition();
  const [error, setError]       = useState<string | null>(null);

  function pickStar(n: number) {
    if (isPending) return;
    setRating(n);
    setError(null);
    if (n >= 4) {
      submit(n, null);
    } else {
      setStage("negative");
    }
  }

  function submitNegative() {
    if (rating === null) return;
    submit(rating, feedback.trim() || null);
  }

  function submit(r: number, note: string | null) {
    start(async () => {
      try {
        const res = await fetch("/api/reviews/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, rating: r, private_feedback: note }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not save your rating");
        if (data.redirect) {
          // 4-5★ → straight to Google's review form.
          window.location.href = data.redirect as string;
          return;
        }
        setStage("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  if (stage === "done") {
    return (
      <div style={panelStyle}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🙏</div>
        <div style={{ fontWeight: 800, color: "var(--navy)", fontSize: 20, marginBottom: 6 }}>
          Thanks, {firstName}.
        </div>
        <div style={{ color: "var(--gray)", fontSize: 14, lineHeight: 1.6 }}>
          We&apos;ve passed your feedback straight to Thomas. He&apos;ll be in touch shortly to make it right.
        </div>
      </div>
    );
  }

  const displayRating = hover ?? rating ?? 0;

  return (
    <div style={panelStyle}>
      <div style={starsRow} role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => pickStar(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            disabled={isPending}
            style={{
              ...starBtn,
              color: n <= displayRating ? "#F5C518" : "rgba(15,27,45,0.2)",
            }}
          >
            ★
          </button>
        ))}
      </div>

      {stage === "negative" && (
        <div style={{ marginTop: 20 }}>
          <label htmlFor="fb" style={{ display: "block", color: "var(--navy)", fontWeight: 700, marginBottom: 8 }}>
            What could we have done better?
          </label>
          <textarea
            id="fb"
            rows={4}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Tell us what went wrong — this goes straight to Thomas."
            style={textareaStyle}
            disabled={isPending}
          />
          <button
            type="button"
            onClick={submitNegative}
            disabled={isPending}
            style={submitBtn}
          >
            {isPending ? "Sending…" : "Send feedback"}
          </button>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--gray)" }}>
            Your feedback won&apos;t be posted publicly.
          </div>
        </div>
      )}

      {error && (
        <div style={errStyle} role="alert">⚠ {error}</div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  padding: "28px 24px",
  maxWidth: 520,
  margin: "0 auto",
  boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
  textAlign: "center",
};
const starsRow: React.CSSProperties = {
  display: "inline-flex", gap: 6,
};
const starBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  padding: "4px 6px",
  fontSize: 52,
  lineHeight: 1,
  cursor: "pointer",
  transition: "color 0.12s ease",
};
const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  fontSize: 15,
  fontFamily: "inherit",
  borderRadius: 10,
  border: "1.5px solid rgba(0,0,0,0.15)",
  resize: "vertical",
  minHeight: 100,
  boxSizing: "border-box",
};
const submitBtn: React.CSSProperties = {
  marginTop: 12,
  background: "var(--navy)", color: "var(--lime)",
  border: "none", borderRadius: 10,
  padding: "12px 22px", fontSize: 15, fontWeight: 800,
  cursor: "pointer", minHeight: 48, width: "100%",
};
const errStyle: React.CSSProperties = {
  marginTop: 14, padding: "8px 12px",
  background: "#FEE2E2", color: "#991B1B",
  borderRadius: 8, fontSize: 13, fontWeight: 700,
};
