"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Network" },
  { href: "/log", label: "Log" },
  { href: "/account", label: "Account" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="mx-auto flex w-full max-w-md items-baseline gap-4 px-5 pb-2 pt-6">
      {TABS.map((tab) => {
        const active =
          tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              active
                ? "text-xl font-bold text-neutral-900 dark:text-neutral-50"
                : "text-xl font-normal text-neutral-400 dark:text-neutral-500"
            }
          >
            {tab.label}.
          </Link>
        );
      })}
    </nav>
  );
}
