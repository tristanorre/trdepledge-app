import { CSSProperties } from "react";

// Single client review card. Used by /reviews — designed so more
// reviews drop in by appending to the TESTIMONIALS array at the bottom
// of this file (or by passing your own array from any other page).
//
// Visual cues match the v16 system already used elsewhere on the
// marketing site: navy text on a soft white card, lime accent for the
// star row, generous quote serif, Caveat-style attribution.

export type TestimonialData = {
  quote: string;
  name: string;
  source: string;     // e.g. "via Google"
  rating: number;     // 1-5 stars
};

type Props = TestimonialData;

export default function Testimonial({ quote, name, source, rating }: Props) {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <article style={cardStyle}>
      <div style={starsRowStyle} aria-label={`${full} out of 5 stars`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} style={{ ...starStyle, color: i < full ? "var(--lime)" : "rgba(0,0,0,0.12)" }}>
            ★
          </span>
        ))}
      </div>
      <blockquote style={quoteStyle}>
        &ldquo;{quote}&rdquo;
      </blockquote>
      <footer style={attrRowStyle}>
        <span style={attrNameStyle}>{name}</span>
        <span style={attrSourceStyle}>{source}</span>
      </footer>
    </article>
  );
}

// Live testimonial list. Drop new entries at the top so the most
// recent review reads first. Verbatim quote — do not paraphrase.
export const TESTIMONIALS: TestimonialData[] = [
  {
    quote:
      "Thomas and Dave came to cut back some of my pines yesterday and did an excellent job and even in 37 degree heat! Thanks for all the help guys it's much appreciated. see you again next time I need anything done.",
    name: "Glen P",
    source: "via Google",
    rating: 5,
  },
];

const cardStyle: CSSProperties = {
  background: "white",
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 20,
  padding: "32px 28px",
  maxWidth: 640,
  margin: "0 auto",
  textAlign: "left",
  boxShadow: "0 4px 14px rgba(0,0,0,0.05)",
};
const starsRowStyle: CSSProperties = {
  display: "flex",
  gap: 4,
  marginBottom: 16,
  fontSize: 22,
  lineHeight: 1,
};
const starStyle: CSSProperties = {
  display: "inline-block",
};
const quoteStyle: CSSProperties = {
  fontSize: 18,
  lineHeight: 1.65,
  color: "var(--navy)",
  margin: "0 0 20px",
  fontWeight: 500,
};
const attrRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  flexWrap: "wrap",
};
const attrNameStyle: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 20,
  color: "var(--navy)",
  fontWeight: 700,
};
const attrSourceStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--gray)",
  fontStyle: "italic",
};
