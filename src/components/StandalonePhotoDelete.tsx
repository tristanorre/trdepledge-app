"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Standalone-only delete button. Removes the photo entirely — from
// storage, from standalone_photos, and (if featured) from
// featured_photos. Unlike Unfeature this cannot be undone.
// Job photos have their own delete flow on the job detail page.

type Props = {
  storagePath: string;
};

export default function StandalonePhotoDelete({ storagePath }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm("Delete this photo permanently? This can't be undone.")) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/admin/gallery-uploads?path=${encodeURIComponent(storagePath)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Delete failed");
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed");
      }
    });
  }

  return (
    <div style={wrapStyle}>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        style={btnStyle}
        title="Permanently delete this uploaded photo"
      >
        {isPending ? "…" : "🗑 Delete"}
      </button>
      {error && <div style={errStyle}>⚠ {error}</div>}
    </div>
  );
}

const wrapStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const btnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: "white", color: "#991B1B",
  border: "1.5px solid rgba(153,27,27,0.35)",
  padding: "6px 12px", borderRadius: 8,
  fontSize: 12, fontWeight: 800, letterSpacing: "0.4px",
  cursor: "pointer", minHeight: 32,
};
const errStyle: React.CSSProperties = {
  fontSize: 11, color: "#B91C1C", fontWeight: 700,
};
