"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PendingBadge } from "./PendingBadge";

const NAV = [
  { href: "/today", label: "Today", icon: "◉" },
  { href: "/trajectory", label: "Trajectory", icon: "→" },
  { href: "/review", label: "Review", icon: "⟡" },
  { href: "/timeline", label: "Timeline", icon: "▤" },
  { href: "/goals", label: "Goals", icon: "△" },
  { href: "/work", label: "Work", icon: "☐" },
  { href: "/behaviors", label: "Behaviors", icon: "↻" },
  { href: "/analytics", label: "Analytics", icon: "∑" },
  { href: "/profile", label: "Profile", icon: "⬡" },
  { href: "/skills", label: "Skills", icon: "⟁" },
  { href: "/readiness", label: "Readiness", icon: "⬢" },
  { href: "/financials", label: "Financials", icon: "₹" },
  { href: "/settings", label: "Settings", icon: "⚙" },
] as const;

export function AppShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex w-52 shrink-0 flex-col border-r"
        style={{ background: "var(--panel)" }}
      >
        <div className="px-4 py-4 border-b">
          <div className="text-sm font-semibold tracking-wide">POS</div>
          <div className="text-2xs mt-0.5" style={{ color: "var(--faint)" }}>
            Personal Operating System
          </div>
        </div>
        <nav className="flex-1 py-2">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                pathname.startsWith(n.href) ? "font-semibold" : ""
              }`}
              style={
                pathname.startsWith(n.href)
                  ? { color: "var(--accent)", background: "var(--panel-2)" }
                  : { color: "var(--muted)" }
              }
            >
              <span className="w-4 text-center text-xs">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-3 border-t text-2xs" style={{ color: "var(--faint)" }}>
          <PendingBadge />
          <div className="mt-1 truncate">{email}</div>
        </div>
      </aside>

      {/* Mobile bottom tabs */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 flex border-t h-14 items-stretch safe-bottom"
        style={{ background: "var(--panel)" }}
      >
        {[NAV[0], NAV[1], NAV[3], NAV[2], NAV[6]].map((n) => (
          <Link
            key={n!.href}
            href={n!.href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-2xs"
            style={{
              color: pathname.startsWith(n!.href) ? "var(--accent)" : "var(--muted)",
            }}
          >
            <span>{n!.icon}</span>
            {n!.label}
          </Link>
        ))}
      </nav>

      <main className="flex-1 min-w-0 pb-16 md:pb-0">
        <div className="mx-auto max-w-5xl px-3 md:px-6 py-4">{children}</div>
      </main>
    </div>
  );
}
