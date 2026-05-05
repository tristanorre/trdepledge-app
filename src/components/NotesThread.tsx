"use client";

import { useState } from "react";
import type { JobNote } from "@/lib/types";

type Props = {
  initialNotes: JobNote[];
  // Endpoint that accepts POST { text } and returns { notes: JobNote[] }
  postUrl: string;
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-AU", {
    day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit",
  });
}

export default function NotesThread({ initialNotes, postUrl }: Props) {
  const [notes, setNotes] = useState<JobNote[]>(initialNotes);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add note");
      setNotes(data.notes as JobNote[]);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--navy)", marginBottom: 12 }}>
        Notes
      </h3>

      {notes.length === 0 ? (
        <div style={{ color: "var(--gray)", fontSize: 14, marginBottom: 16 }}>
          No notes yet — add the first below.
        </div>
      ) : (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {notes.map((n, i) => (
            <li
              key={i}
              style={{
                background: "var(--off)",
                borderRadius: 12,
                padding: 12,
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: "var(--navy)", fontSize: 13 }}>{n.author_name}</span>
                <span style={{ color: "var(--gray)", fontSize: 12 }}>{formatTimestamp(n.timestamp)}</span>
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{n.text}</div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit}>
        <textarea
          className="form-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note from the field…"
          rows={3}
          maxLength={4000}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          {error && <span className="form-error">⚠ {error}</span>}
          <span />
          <button
            type="submit"
            disabled={submitting || !text.trim()}
            style={{
              background: "var(--navy)", color: "white",
              border: "none", borderRadius: 8,
              padding: "10px 18px", fontSize: 14, fontWeight: 700,
              cursor: "pointer", minHeight: 40,
              opacity: submitting || !text.trim() ? 0.6 : 1,
            }}
          >
            {submitting ? "Adding…" : "Add note"}
          </button>
        </div>
      </form>
    </div>
  );
}
