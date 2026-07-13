"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Admin navigation. Renders TWO layouts driven by CSS media queries in
// globals.css:
//   Desktop (>= 768px)  →  fixed left sidebar (.admin-sidebar)
//   Mobile  (<  768px)  →  fixed bottom nav (.admin-bottom-nav)
// Only one is visible at a time; the other is display:none.
//
// Active-state highlight relies on usePathname, which is why this is a
// client component. The parent layout stays server (so requireAdmin()
// can auth against the request).

const LINKS: Array<{ href: string; label: string }> = [
  { href: "/admin",            label: "Dashboard" },
  { href: "/admin/jobs",       label: "Jobs" },
  { href: "/admin/schedule",   label: "Schedule" },
  { href: "/admin/time",       label: "Time" },
  { href: "/admin/hr",         label: "HR" },
  { href: "/admin/inventory",  label: "Inventory" },
  { href: "/admin/materials",  label: "Materials" },
  { href: "/admin/clients",    label: "Clients" },
  { href: "/admin/costs",      label: "Costs" },
  { href: "/admin/photos",     label: "Photos" },
];

// A route is "active" when the current path either matches exactly, or
// is nested under it. Dashboard is the exception — being an exact match
// only, otherwise every deeper /admin/* page would highlight it too.
function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AdminNav() {
  const pathname = usePathname() ?? "/admin";

  return (
    <>
      <nav className="admin-sidebar" aria-label="Admin sections (desktop)">
        {LINKS.map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={"admin-sidebar-link" + (active ? " is-active" : "")}
              aria-current={active ? "page" : undefined}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      <nav className="admin-bottom-nav" aria-label="Admin sections (mobile)">
        {LINKS.map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={"admin-bottom-nav-link" + (active ? " is-active" : "")}
              aria-current={active ? "page" : undefined}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
