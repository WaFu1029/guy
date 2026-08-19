"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Network" },
  { href: "/log", label: "Log" },
  { href: "/account", label: "Account" },
];

// Confirms the tap on a slow transition — a prefetched route settles before
// this ever shows. Always rendered at a fixed size and toggled by opacity so
// it can't shift the row.
function PendingDot() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={
        "ml-1 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle transition-opacity duration-150 " +
        (pending ? "animate-pulse opacity-60" : "opacity-0")
      }
    />
  );
}

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="mx-auto flex w-full max-w-md items-baseline gap-4 px-5 pb-2 pt-6 lg:max-w-7xl lg:px-7">
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
            <PendingDot />
          </Link>
        );
      })}
    </nav>
  );
}
