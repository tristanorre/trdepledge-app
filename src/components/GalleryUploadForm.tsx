"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";

// Upload widget on /admin/photos for standalone gallery images —
// photos Thomas adds directly from his phone that aren't attached to
// any job. Mirrors JobPhotosSection's upload behaviour (multi-file,
// sequential upload, browser-image-compression to keep field-network
// uploads under ~1MB each).

type Kind = "before" | "after";

const COMPRESSION_OPTS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 2000,
  useWebWorker: true,
  initialQuality: 0.85,
  fileType: "image/jpeg" as const,
};

export default function GalleryUploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState<Kind>("after");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCount, setLastCount] = useState<number>(0);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Compressing ${i + 1}/${files.length}…`);
        const compressed = await imageCompression(file, COMPRESSION_OPTS);

        setProgress(`Uploading ${i + 1}/${files.length}…`);
        const fd = new FormData();
        fd.set("kind", kind);
        fd.set("file", compressed, compressed.name || `photo-${i + 1}.jpg`);

        const res = await fetch("/api/admin/gallery-uploads", {
          method: "POST",
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
      }
      setLastCount(files.length);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>Add photos to the gallery</h2>
          <p style={subStyle}>
            Upload photos directly — no job needed. They'll appear in the grid below where you can Feature them onto the public site.
          </p>
        </div>
      </div>

      <div style={rowStyle}>
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Tag as</legend>
          <label style={radioLabel}>
            <input
              type="radio"
              name="upload-kind"
              value="before"
              checked={kind === "before"}
              onChange={() => setKind("before")}
              disabled={uploading}
            />
            <span>Before</span>
          </label>
          <label style={radioLabel}>
            <input
              type="radio"
              name="upload-kind"
              value="after"
              checked={kind === "after"}
              onChange={() => setKind("after")}
              disabled={uploading}
            />
            <span>After</span>
          </label>
        </fieldset>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          multiple
          onChange={(e) => upload(e.target.files)}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={uploadBtn}
        >
          {uploading ? (progress ?? "Uploading…") : "📷 Choose photos"}
        </button>
      </div>

      {error && (
        <div style={errStyle} role="alert">⚠ {error}</div>
      )}
      {!error && !uploading && lastCount > 0 && (
        <div style={okStyle} role="status">
          ✓ Uploaded {lastCount} photo{lastCount === 1 ? "" : "s"}. Scroll down to feature them on the public gallery.
        </div>
      )}
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  padding: 16,
  marginBottom: 20,
};
const headerStyle: React.CSSProperties = {
  marginBottom: 12,
};
const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 18, color: "var(--navy)",
  margin: 0, lineHeight: 1.2,
};
const subStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--gray)", margin: "4px 0 0 0", lineHeight: 1.5,
};
const rowStyle: React.CSSProperties = {
  display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center",
};
const fieldsetStyle: React.CSSProperties = {
  border: "1.5px solid rgba(0,0,0,0.12)",
  borderRadius: 10,
  padding: "8px 12px",
  display: "flex", gap: 12, alignItems: "center",
  margin: 0,
};
const legendStyle: React.CSSProperties = {
  fontSize: 11, color: "var(--gray)", fontWeight: 700,
  letterSpacing: "0.6px", textTransform: "uppercase",
  padding: "0 6px",
};
const radioLabel: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  fontSize: 14, fontWeight: 700, color: "var(--navy)",
  cursor: "pointer",
};
const uploadBtn: React.CSSProperties = {
  background: "var(--lime)", color: "var(--navy)",
  border: "none", borderRadius: 10,
  padding: "10px 18px", fontSize: 14, fontWeight: 800,
  cursor: "pointer", minHeight: 44,
  display: "inline-flex", alignItems: "center", gap: 6,
};
const errStyle: React.CSSProperties = {
  marginTop: 10, padding: "8px 12px",
  background: "#FEE2E2", color: "#991B1B",
  borderRadius: 8, fontSize: 13, fontWeight: 700,
};
const okStyle: React.CSSProperties = {
  marginTop: 10, padding: "8px 12px",
  background: "rgba(208,255,89,0.35)", color: "var(--navy)",
  borderRadius: 8, fontSize: 13, fontWeight: 700,
};
