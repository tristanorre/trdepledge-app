"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// One-click toggle beside each photo tile on /admin/photos. Adds the
// photo to featured_photos (POST) if not currently featured; removes
// it (DELETE) if it is. Uses useTransition so the pending state
// disables the button without a hard blocking spinner.

type Props = {
  jobId: string;
  kind: "before" | "after";
  storagePath: string;
  featured: boolean;
};

export default function FeaturePhotoToggle({ jobId, kind, storagePath, featured }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [local, setLocal] = useState(featured);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    const next = !local;
    // Optimistic — flip immediately, revert if the API rejects.
    setLocal(next);
    startTransition(async () => {
      try {
        const res = next
          ? await fetch("/api/admin/photos/feature", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ job_id: jobId, kind, storage_path: storagePath }),
            })
          : await fetch(
              `/api/admin/photos/feature?path=${encodeURIComponent(storagePath)}`,
              { method: "DELETE" },
            );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Save failed");
        }
        router.refresh();
      } catch (e) {
        setLocal(!next); // revert
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  return (
    <div style={wrapStyle}>
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        style={local ? activeBtn : baseBtn}
        aria-pressed={local}
        title={local ? "Featured on /gallery — click to remove" : "Feature on /gallery"}
      >
        <span aria-hidden="true">{local ? "★" : "☆"}</span>
        <span>{local ? "Featured" : "Feature"}</span>
      </button>
      {error && <div style={errStyle}>⚠ {error}</div>}
    </div>
  );
}

const wrapStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const baseBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: "white", color: "var(--navy)",
  border: "1.5px solid rgba(0,0,0,0.15)",
  padding: "6px 12px", borderRadius: 8,
  fontSize: 12, fontWeight: 800, letterSpacing: "0.4px",
  cursor: "pointer", minHeight: 32,
};
const activeBtn: React.CSSProperties = {
  ...baseBtn,
  background: "var(--lime)",
  borderColor: "var(--lime)",
};
const errStyle: React.CSSProperties = {
  fontSize: 11, color: "#B91C1C", fontWeight: 700,
};
