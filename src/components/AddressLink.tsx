import type { ReactNode } from "react";

type Props = {
  address?: string | null;
  suburb?: string | null;
  postcode?: string | null;
  children?: ReactNode;
};

// Tap-to-open in Apple Maps / Google Maps. Mobile browsers route the
// geo: scheme to whichever maps app is default; on desktop the http
// fallback opens Google Maps in a new tab.
export default function AddressLink({ address, suburb, postcode, children }: Props) {
  const parts = [address, suburb, postcode, "Australia"].filter(Boolean) as string[];
  if (parts.length <= 1) {
    // No real address — just render the children/text without a link.
    return <span>{children ?? address ?? suburb ?? "—"}</span>;
  }
  const query = parts.join(", ");
  const encoded = encodeURIComponent(query);
  const href = `https://maps.google.com/?q=${encoded}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: "var(--navy)", textDecoration: "underline", textUnderlineOffset: "3px" }}
    >
      {children ?? query}
    </a>
  );
}
