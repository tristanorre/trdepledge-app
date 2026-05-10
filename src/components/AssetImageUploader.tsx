"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  assetId: string;
  initialUrl: string | null;     // signed URL from the server, or null if no image
  emojiFallback: string | null;
};

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

export default function AssetImageUploader({ assetId, initialUrl, emojiFallback }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickFile() {
    fileInputRef.current?.click();
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    if (file.size > MAX_BYTES) {
      setError(`File too large — max ${MAX_BYTES / 1024 / 1024} MB`);
      e.target.value = "";
      return;
    }
    if (!ACCEPT.split(",").includes(file.type)) {
      setError("Use a JPG, PNG, or WebP image");
      e.target.value = "";
      return;
    }

    // Optimistic preview while the upload runs.
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setBusy(true);

    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/admin/inventory/${assetId}/image`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      // Refresh the page so the server-rendered signed URL replaces
      // our local object URL (which expires when the page reloads
      // anyway).
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPreviewUrl(initialUrl);  // revert
    } finally {
      setBusy(false);
      e.target.value = "";        // allow re-selecting the same file
      URL.revokeObjectURL(localPreview);
    }
  }

  async function removeImage() {
    if (!previewUrl) return;
    if (!confirm("Remove this image? The asset will revert to its emoji icon.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inventory/${assetId}/image`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not remove");
      setPreviewUrl(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={containerStyle}>
      <h3 style={titleStyle}>Image</h3>

      <div style={frameStyle}>
        {previewUrl ? (
          // Signed URLs / blob URLs are arbitrary so use a regular
          // <img> rather than next/image's domain allowlist gymnastics.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Asset"
            style={imgStyle}
          />
        ) : (
          <div style={emojiStyle}>{emojiFallback ?? "📦"}</div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        onChange={onFileChosen}
        style={{ display: "none" }}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={pickFile} disabled={busy} style={btnPrimary}>
          {busy ? "Working…" : previewUrl ? "Replace image" : "Upload image"}
        </button>
        {previewUrl && (
          <button type="button" onClick={removeImage} disabled={busy} style={btnDanger}>
            Remove
          </button>
        )}
      </div>

      <p style={hintStyle}>
        JPG, PNG, or WebP · max 10&nbsp;MB. The image stays private —
        only logged-in admins see it.
      </p>

      {error && (
        <div role="alert" style={errorStyle}>⚠ {error}</div>
      )}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  background: "white", borderRadius: 14, padding: 20,
  border: "1px solid rgba(0,0,0,0.06)",
  display: "flex", flexDirection: "column", gap: 12,
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 18,
  color: "var(--navy)", margin: 0,
};
const frameStyle: React.CSSProperties = {
  width: "100%", maxWidth: 360, aspectRatio: "1 / 1",
  borderRadius: 12, overflow: "hidden",
  background: "var(--off)",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const imgStyle: React.CSSProperties = {
  width: "100%", height: "100%", objectFit: "cover", display: "block",
};
const emojiStyle: React.CSSProperties = {
  fontSize: 96, lineHeight: 1, opacity: 0.55,
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 800,
  background: "var(--navy)", color: "white", border: "none", cursor: "pointer",
};
const btnDanger: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 800,
  background: "#FEE2E2", color: "#B91C1C",
  border: "1px solid #FCA5A5", cursor: "pointer",
};
const hintStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--gray)", margin: 0, lineHeight: 1.5,
};
const errorStyle: React.CSSProperties = {
  marginTop: 4, padding: 10,
  background: "rgba(220,38,38,0.10)", color: "#B91C1C",
  borderRadius: 8, fontSize: 13, fontWeight: 600,
};
