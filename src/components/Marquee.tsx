const ITEMS = [
  "Lawn Mowing",
  "Hedge Trimming",
  "Garden Maintenance",
  "NDIS Approved",
  "Instant Lawn Installs",
  "Aged Care Services",
  "Yard Revamps",
  "Landscaping",
  "Police Checked Staff",
  "Copper Coast SA",
];

export default function Marquee() {
  // Duplicated content drives the seamless loop (the keyframe travels -50%).
  const items = [...ITEMS, ...ITEMS];
  return (
    <div className="marquee-band" aria-hidden="true">
      <div className="marquee-track">
        {items.map((label, i) => (
          <span key={i} className="marquee-item">
            {label} <span className="marquee-dot" />
          </span>
        ))}
      </div>
    </div>
  );
}
