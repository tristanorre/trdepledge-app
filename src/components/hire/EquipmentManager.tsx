"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { fmtHireMoney, validateEquipment, type Equipment } from "@/lib/hire";
import { hirePhotoUrl } from "@/lib/storage";
import * as s from "./adminStyles";

type Draft = {
  id?: string;
  name: string;
  category: string;
  blurb: string;
  specs: string;
  dailyRate: string;
  bond: string;
  photoPath: string;
  flyerPath: string;
  isPublished: boolean;
  changeoverDays: string;
};

const BLANK: Draft = {
  name: "",
  category: "",
  blurb: "",
  specs: "",
  dailyRate: "",
  bond: "",
  photoPath: "",
  flyerPath: "",
  isPublished: true,
  changeoverDays: "0",
};

function toDraft(e: Equipment): Draft {
  return {
    id: e.id,
    name: e.name,
    category: e.category,
    blurb: e.blurb ?? "",
    specs: e.specs.join("\n"),
    // Money is held as a dollars string in the form because that's what
    // Thomas types; validateEquipment converts to cents at the edge.
    dailyRate: (e.dailyRateCents / 100).toString(),
    bond: (e.bondCents / 100).toString(),
    photoPath: e.photoPath ?? "",
    flyerPath: e.flyerPath ?? "",
    isPublished: e.isPublished,
    changeoverDays: String(e.changeoverDays),
  };
}

/**
 * The equipment floor: what's listed, what it costs, what's published.
 *
 * The removal rule is enforced server-side; this component just relays what
 * the server says and offers the unpublish fallback when it refuses.
 */
export default function EquipmentManager({
  equipment,
  categories,
}: {
  equipment: Equipment[];
  categories: string[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function edit(e: Equipment) {
    setDraft(toDraft(e));
    setError(null);
    setNotice(null);
  }

  async function save() {
    if (!draft) return;

    const check = validateEquipment({
      name: draft.name,
      category: draft.category,
      blurb: draft.blurb,
      specs: draft.specs.split("\n"),
      dailyRate: draft.dailyRate,
      bond: draft.bond,
      photoPath: draft.photoPath,
      flyerPath: draft.flyerPath,
      isPublished: draft.isPublished,
      changeoverDays: Number(draft.changeoverDays),
    });
    if (!check.ok) {
      setError(check.message);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: draft.name,
        category: draft.category,
        blurb: draft.blurb,
        specs: draft.specs.split("\n"),
        dailyRate: draft.dailyRate,
        bond: draft.bond,
        photoPath: draft.photoPath,
        flyerPath: draft.flyerPath,
        isPublished: draft.isPublished,
        changeoverDays: Number(draft.changeoverDays),
      };
      const res = await fetch(
        draft.id ? `/api/admin/hire/equipment/${draft.id}` : "/api/admin/hire/equipment",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "That didn't save. Try again.");
        return;
      }
      setDraft(null);
      router.refresh();
    } catch {
      setError("That didn't save — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function setPublished(e: Equipment, isPublished: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hire/equipment/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "That didn't save. Try again.");
        return;
      }
      setNotice(
        isPublished
          ? `${e.name} is back on the public page.`
          : `${e.name} is off the public page. Existing bookings still stand.`,
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: Equipment) {
    if (!window.confirm(`Remove ${e.name} from the floor?`)) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/hire/equipment/${e.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // The removal rule refused. Offer the fallback it named rather than
        // making Thomas work out what to do instead.
        if (data?.canUnpublish) {
          if (window.confirm(`${data.error}\n\nUnpublish it now?`)) {
            await setPublished(e, false);
            return;
          }
          setNotice(data.error);
          return;
        }
        setError(data?.error ?? "That didn't save. Try again.");
        return;
      }

      setNotice(`${e.name} removed. Its booking history is kept.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button
          type="button"
          style={s.actionButton("primary")}
          onClick={() => {
            setDraft({ ...BLANK });
            setError(null);
            setNotice(null);
          }}
        >
          Add a tool
        </button>
      </div>

      {notice && (
        <div style={{ ...s.card, background: "#F0FDF4", borderColor: "#BBF7D0", marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 14, color: "#166534" }}>{notice}</p>
        </div>
      )}
      {error && (
        <p style={s.errorText} role="alert">
          {error}
        </p>
      )}

      {draft && (
        <EquipmentForm
          draft={draft}
          categories={categories}
          busy={busy}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={save}
        />
      )}

      {equipment.length === 0 ? (
        <div style={s.empty}>Nothing on the floor yet. Add your first tool above.</div>
      ) : (
        <div style={s.list}>
          {equipment.map((e) => (
            <div key={e.id} style={s.row}>
              <div
                style={{
                  position: "relative",
                  width: 56,
                  height: 56,
                  flex: "0 0 56px",
                  borderRadius: 8,
                  overflow: "hidden",
                  background: "#F3F4F6",
                }}
              >
                {hirePhotoUrl(e.photoPath) && (
                  <Image
                    src={hirePhotoUrl(e.photoPath)!}
                    alt=""
                    fill
                    sizes="56px"
                    style={{ objectFit: "cover" }}
                  />
                )}
              </div>

              <div style={s.rowMain}>
                <div style={s.rowTitle}>
                  {e.name}
                  {!e.isPublished && (
                    <span style={{ ...s.muted, fontWeight: 600 }}> · not published</span>
                  )}
                </div>
                <div style={s.rowMeta}>
                  {e.category} · {fmtHireMoney(e.dailyRateCents)}/day ·{" "}
                  {fmtHireMoney(e.bondCents)} bond
                  {e.changeoverDays > 0 &&
                    ` · ${e.changeoverDays}-day changeover`}
                  {/* Called out only when it's MISSING. A flyer is the norm,
                      so listing "has a flyer" seven times says nothing; the
                      one item without one is the thing worth seeing. */}
                  {!e.flyerPath && <span style={{ fontWeight: 600 }}> · no flyer</span>}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={s.actionButton("quiet")}
                  disabled={busy}
                  onClick={() => edit(e)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  style={s.actionButton("quiet")}
                  disabled={busy}
                  onClick={() => setPublished(e, !e.isPublished)}
                >
                  {e.isPublished ? "Unpublish" : "Publish"}
                </button>
                <button
                  type="button"
                  style={s.actionButton("danger")}
                  disabled={busy}
                  onClick={() => remove(e)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EquipmentForm({
  draft,
  categories,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft;
  categories: string[];
  busy: boolean;
  onChange: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });

  return (
    <div style={{ ...s.card, marginBottom: 18 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 17 }}>
        {draft.id ? `Edit ${draft.name || "tool"}` : "Add a tool"}
      </h3>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <Field label="Name">
          <input
            className="form-input"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Cement Mixer"
          />
        </Field>

        <Field label="Category">
          {/* Datalist rather than a fixed list: Thomas can reuse an existing
              category or type a new one without a code change. */}
          <input
            className="form-input"
            list="hire-categories"
            value={draft.category}
            onChange={(e) => set("category", e.target.value)}
            placeholder="Concrete"
          />
          <datalist id="hire-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        <Field label="Daily rate">
          <input
            className="form-input"
            inputMode="decimal"
            value={draft.dailyRate}
            onChange={(e) => set("dailyRate", e.target.value)}
            placeholder="80"
          />
        </Field>

        <Field label="Bond">
          <input
            className="form-input"
            inputMode="decimal"
            value={draft.bond}
            onChange={(e) => set("bond", e.target.value)}
            placeholder="150"
          />
        </Field>

        <Field label="Changeover days">
          <input
            className="form-input"
            inputMode="numeric"
            value={draft.changeoverDays}
            onChange={(e) => set("changeoverDays", e.target.value)}
          />
          <small style={{ ...s.muted, fontSize: 12 }}>
            0 = next customer can collect the day after it comes back.
          </small>
        </Field>

        {draft.id ? (
          <Field label="Photo">
            <ImageUploader
              equipmentId={draft.id}
              kind="photo"
              path={draft.photoPath}
              onChange={(p) => set("photoPath", p)}
            />
          </Field>
        ) : (
          <Field label="Photo">
            <p style={{ ...s.muted, margin: 0, fontSize: 13 }}>
              Add the tool first, then edit it to upload a photo.
            </p>
          </Field>
        )}

        {/* The flyer had no field at all until now — it could only be set by
            a migration, so a tool Thomas added himself could never have one
            and the seeded six couldn't be changed without a deploy. It also
            means the path is finally VISIBLE, which is what you want when a
            card isn't showing its "View the flyer" link. */}
        {draft.id ? (
          <Field label="Flyer">
            <ImageUploader
              equipmentId={draft.id}
              kind="flyer"
              path={draft.flyerPath}
              onChange={(p) => set("flyerPath", p)}
            />
            <small style={{ ...s.muted, fontSize: 12, display: "block", marginTop: 6 }}>
              {draft.flyerPath ? (
                <>
                  Currently: <code>{draft.flyerPath}</code>
                </>
              ) : (
                "No flyer — the card won't show a “View the flyer” link."
              )}
            </small>
          </Field>
        ) : (
          <Field label="Flyer">
            <p style={{ ...s.muted, margin: 0, fontSize: 13 }}>
              Add the tool first, then edit it to upload a flyer.
            </p>
          </Field>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <Field label="Description">
          <textarea
            className="form-textarea"
            style={{ minHeight: 70 }}
            value={draft.blurb}
            onChange={(e) => set("blurb", e.target.value)}
            placeholder="Tilting drum for concrete, mortar and render."
          />
        </Field>
      </div>

      <div style={{ marginTop: 12 }}>
        <Field label="Spec bullets (one per line, up to 6)">
          <textarea
            className="form-textarea"
            style={{ minHeight: 70 }}
            value={draft.specs}
            onChange={(e) => set("specs", e.target.value)}
            placeholder={"Large drum for medium to big pours\nStrong motor, mixes evenly"}
          />
        </Field>
      </div>

      <label style={{ display: "flex", gap: 10, alignItems: "center", margin: "14px 0" }}>
        <input
          type="checkbox"
          checked={draft.isPublished}
          onChange={(e) => set("isPublished", e.target.checked)}
          style={{ width: 20, height: 20 }}
        />
        <span style={{ fontSize: 14 }}>Show on the public hire page</span>
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={s.actionButton("primary")} disabled={busy} onClick={onSave}>
          {busy ? "Saving…" : draft.id ? "Save changes" : "Add it to the floor"}
        </button>
        <button type="button" style={s.actionButton("quiet")} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** What the uploader is called, per image kind, in Thomas's words. */
const IMAGE_COPY = {
  photo: {
    noun: "photo",
    add: "Upload a photo",
    replace: "Replace photo",
    remove: "Remove photo",
    confirm: "Remove this photo?",
    hint: "JPG, PNG or WebP, up to 10 MB. Saves as soon as it uploads.",
    fit: "cover" as const,
  },
  flyer: {
    noun: "flyer",
    add: "Upload a flyer",
    replace: "Replace flyer",
    remove: "Remove flyer",
    confirm: "Remove this flyer? The card's “View the flyer” link goes with it.",
    // Contained, not cropped: a flyer is a tall spec sheet and the whole
    // point of the thumbnail is to confirm it's the right one.
    hint: "The spec sheet the card's “View the flyer” link opens. Portrait works best.",
    fit: "contain" as const,
  },
} as const;

/**
 * Upload / replace / remove one image for an item — the card photo or the
 * flyer, chosen by `kind`.
 *
 * Saves immediately rather than waiting for the form's Save button. A file
 * upload is a multipart request to its own endpoint, so folding it into the
 * JSON save would mean either holding the bytes in memory until Save or
 * inventing a two-phase submit — and Thomas taking a photo on his phone
 * expects it to be there once the spinner stops.
 */
function ImageUploader({
  equipmentId,
  kind,
  path,
  onChange,
}: {
  equipmentId: string;
  kind: "photo" | "flyer";
  path: string;
  onChange: (path: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = IMAGE_COPY[kind];
  const preview = hirePhotoUrl(path);
  const field = kind === "photo" ? "photoPath" : "flyerPath";

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/admin/hire/equipment/${equipmentId}/${kind}`, {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? `That ${copy.noun} didn't upload. Try again.`);
        return;
      }
      onChange(data[field] ?? "");
      router.refresh();
    } catch {
      setError(`That ${copy.noun} didn't upload — check your connection and try again.`);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!window.confirm(copy.confirm)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hire/equipment/${equipmentId}/${kind}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "That didn't save. Try again.");
        return;
      }
      onChange("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div
          style={{
            position: "relative",
            width: 72,
            height: 72,
            flex: "0 0 72px",
            borderRadius: 8,
            overflow: "hidden",
            background: "#F3F4F6",
            border: "1px solid #E5E7EB",
          }}
        >
          {preview && (
            <Image src={preview} alt="" fill sizes="72px" style={{ objectFit: copy.fit }} />
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* A label wrapping a hidden input is the accessible way to get a
              styled file picker — it stays keyboard-reachable and announces
              properly, which a div with an onClick would not. */}
          <label
            style={{
              ...s.actionButton("quiet"),
              display: "inline-flex",
              alignItems: "center",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Uploading…" : preview ? copy.replace : copy.add}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                opacity: 0,
                overflow: "hidden",
              }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                // Reset so picking the same file twice still fires onChange.
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
          </label>

          {preview && (
            <button type="button" style={s.actionButton("danger")} disabled={busy} onClick={clear}>
              {copy.remove}
            </button>
          )}
        </div>
      </div>

      <small style={{ ...s.muted, fontSize: 12, display: "block", marginTop: 6 }}>
        {copy.hint}
      </small>

      {error && (
        <p style={s.errorText} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ ...s.tileLabel, display: "block", marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}
