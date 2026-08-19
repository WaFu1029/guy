"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

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
  const router = useRouter();

  // Option+1/2/3 jumps between the tabs. Matched on e.code because Option+digit
  // on macOS reports key as "¡"/"™"/"£", not the digit.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      const index = TABS.findIndex((_, i) => e.code === `Digit${i + 1}`);
      if (index === -1) return;
      // Stops the browser inserting the Option-modified character when the
      // shortcut fires with a text field focused.
      e.preventDefault();
      router.push(TABS[index].href);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return (
    <nav className="mx-auto flex w-full max-w-md items-baseline gap-4 px-5 pb-2 pt-6 lg:max-w-7xl lg:px-7">
      {TABS.map((tab, i) => {
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
            {/* Hidden on touch-sized screens, where there's no key to press. */}
            <span
              aria-hidden
              className="ml-1 hidden align-super text-[10px] font-normal tabular-nums text-neutral-400 dark:text-neutral-500 sm:inline"
            >
              ⌥{i + 1}
            </span>
            <PendingDot />
          </Link>
        );
      })}
    </nav>
  );
}
