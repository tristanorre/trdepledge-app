"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";

type Photo = { path: string; url: string };

type Props = {
  jobId: string;
  kind: "before" | "after";
  initialPhotos: Photo[];
  canCapture: boolean;
  canDelete: boolean;
};

const COMPRESSION_OPTS = {
  maxSizeMB: 1,           // <= 1MB per spec
  maxWidthOrHeight: 2000, // shrink huge phone photos
  useWebWorker: true,
  initialQuality: 0.85,
  fileType: "image/jpeg" as const,
};

const KIND_LABEL = { before: "Before", after: "After" } as const;

export default function JobPhotosSection({
  jobId, kind, initialPhotos, canCapture, canDelete,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    try {
      // Sequential uploads — most field connections are mobile, parallelism
      // hurts more than it helps (and keeps progress reporting honest).
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Compressing ${i + 1}/${files.length}…`);
        const compressed = await imageCompression(file, COMPRESSION_OPTS);

        setProgress(`Uploading ${i + 1}/${files.length}…`);
        const fd = new FormData();
        fd.set("kind", kind);
        fd.set("file", compressed, compressed.name || `photo-${i + 1}.jpg`);

        const res = await fetch(`/api/jobs/${jobId}/photos`, { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");

        // Optimistically add a placeholder using the local file's blob URL.
        // It'll be replaced with the signed URL on the next router.refresh().
        const blobUrl = URL.createObjectURL(compressed);
        setPhotos((cur) => [...cur, { path: data.path, url: blobUrl }]);
      }
      // Refresh the server component so we get real signed URLs and
      // any other photos uploaded in parallel from another device.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function deletePhoto(p: Photo) {
    if (!confirm("Delete this photo?")) return;
    setBusyDelete(p.path);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/photos`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: p.path, kind }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Delete failed");
      }
      setPhotos((cur) => cur.filter((x) => x.path !== p.path));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyDelete(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--navy)" }}>
          {KIND_LABEL[kind]} photos {photos.length > 0 && <span style={{ color: "var(--gray)", fontSize: 14, fontFamily: "var(--font-body)" }}>· {photos.length}</span>}
        </h3>

        {canCapture && (
          <>
            <input
              ref={inputRef}
              type="file"
              // iOS Safari camera roll defaults to HEIC. Including
              // image/heic and image/heif lets the user pick those
              // photos; browser-image-compression decodes them and
              // emits JPEG (`fileType: "image/jpeg"` in COMPRESSION_OPTS).
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              capture="environment"
              multiple
              onChange={(e) => uploadFiles(e.target.files)}
              style={{ display: "none" }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              style={captureBtn}
            >
              {uploading ? (progress ?? "Uploading…") : `📷 Add ${kind}`}
            </button>
          </>
        )}
      </div>

      {photos.length === 0 ? (
        <div style={{ color: "var(--gray)", fontSize: 14, padding: "8px 0" }}>
          No {kind} photos yet.
        </div>
      ) : (
        <div style={gridStyle}>
          {photos.map((p) => (
            <div key={p.path} style={tileStyle}>
              {/* Plain <img> — these are short-lived signed URLs from
                  Supabase, not next/image-optimised assets. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <a href={p.url} target="_blank" rel="noopener noreferrer">
                <img
                  src={p.url}
                  alt={`${kind} photo`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </a>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => deletePhoto(p)}
                  disabled={busyDelete === p.path}
                  aria-label="Delete photo"
                  style={deleteBtnStyle}
                >
                  {busyDelete === p.path ? "…" : "✕"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <div className="form-error" role="alert" style={{ marginTop: 8 }}>⚠ {error}</div>}
    </div>
  );
}

const captureBtn: React.CSSProperties = {
  background: "var(--lime)", color: "var(--navy)",
  border: "none", borderRadius: 10,
  padding: "10px 16px", fontSize: 13, fontWeight: 800,
  cursor: "pointer", minHeight: 40,
  display: "inline-flex", alignItems: "center", gap: 6,
};
const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  gap: 8,
};
const tileStyle: React.CSSProperties = {
  position: "relative",
  aspectRatio: "1 / 1",
  borderRadius: 10,
  overflow: "hidden",
  background: "var(--navy)",
};
const deleteBtnStyle: React.CSSProperties = {
  position: "absolute",
  top: 6, right: 6,
  background: "rgba(10,31,61,0.85)", color: "white",
  border: "none", borderRadius: 999,
  width: 28, height: 28,
  fontSize: 12, fontWeight: 700,
  cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};
