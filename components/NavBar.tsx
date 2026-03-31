"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";

type NavLink = { href: string; label: string; exact?: boolean };
type NavGroup = { label: string; items: NavLink[] };
type NavEntry = NavLink | NavGroup;

const NAV_ENTRIES: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Produkte" },
  { href: "/brands", label: "Marken" },
  {
    label: "Hersteller",
    items: [
      { href: "/manufacturer-buffer", label: "Hersteller-Puffer" },
      { href: "/manufacturer-requests", label: "Anfragen" },
    ],
  },
  {
    label: "Produktpflege",
    items: [
      { href: "/datenpflege", label: "Datenpflege" },
      { href: "/import", label: "Import" },
    ],
  },
  {
    label: "Schätzungen",
    items: [
      { href: "/sampling", label: "Stichproben", exact: true },
      { href: "/sampling/session", label: "Wiegesession" },
      { href: "/estimation-rules", label: "Schätzlogik" },
      { href: "/compliance", label: "Compliance" },
    ],
  },
];

function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

function useIsActive(pathname: string) {
  return (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);
}

function DropdownMenu({
  group,
  pathname,
}: {
  group: NavGroup;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = useIsActive(pathname);
  const groupActive = group.items.some((item) =>
    isActive(item.href, item.exact)
  );

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
          groupActive
            ? "bg-gray-100 text-gray-900"
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
        }`}
      >
        {group.label}
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2 text-sm transition-colors ${
                isActive(item.href, item.exact)
                  ? "bg-gray-100 text-gray-900 font-medium"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function NavBar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const isActive = useIsActive(pathname);

  useEffect(() => {
    setMenuOpen(false);
    setExpandedGroup(null);
  }, [pathname]);

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/dashboard" className="font-bold text-lg text-gray-900 flex-shrink-0">
            ComplianceHub
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_ENTRIES.map((entry) => {
              if (isGroup(entry)) {
                return (
                  <DropdownMenu key={entry.label} group={entry} pathname={pathname} />
                );
              }
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    isActive(entry.href, entry.exact)
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {entry.label}
                </Link>
              );
            })}
          </div>

          <div className="hidden md:block text-xs text-gray-400">
            Verpackungsdaten-System
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Navigation öffnen"
          >
            {menuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white shadow-lg">
          <div className="px-4 py-2 space-y-1">
            {NAV_ENTRIES.map((entry) => {
              if (isGroup(entry)) {
                const groupActive = entry.items.some((item) =>
                  isActive(item.href, item.exact)
                );
                const expanded = expandedGroup === entry.label;
                return (
                  <div key={entry.label}>
                    <button
                      onClick={() =>
                        setExpandedGroup(expanded ? null : entry.label)
                      }
                      className={`w-full flex items-center justify-between px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                        groupActive
                          ? "bg-gray-100 text-gray-900"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                      }`}
                    >
                      {entry.label}
                      <svg
                        className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expanded && (
                      <div className="ml-4 mt-1 space-y-1">
                        {entry.items.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`block px-3 py-2.5 rounded-lg text-sm transition-colors ${
                              isActive(item.href, item.exact)
                                ? "bg-gray-100 text-gray-900 font-medium"
                                : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                            }`}
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className={`block px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive(entry.href, entry.exact)
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {entry.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
