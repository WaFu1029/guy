"use client";

import Link from "next/link";
import { ContactChips } from "@/components/ContactChips";
import type { PinnedEntry } from "@/lib/orgHubs";
import type { Group } from "@/types/database";

// One detail card for a pinned node — a person or a derived org hub. The same
// markup serves the mobile card stack docked to the graph and the desktop
// info panel in the right column; only the wrapper classes differ.
export function PinnedCard({
  entry,
  groups,
  onUnpin,
  className,
}: {
  entry: PinnedEntry;
  groups: Group[];
  onUnpin: (id: string) => void;
  className?: string;
}) {
  if (entry.type === "org") {
    const org = entry.org;
    return (
      <div className={className}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-bold text-neutral-900 dark:text-neutral-50">
              {org.label}
            </p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {org.kind === "school" ? "School" : "Company"} · {org.members.length} people
            </p>
          </div>
          <button
            type="button"
            onClick={() => onUnpin(org.id)}
            aria-label={`Unpin ${org.label}`}
            className="shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-700 px-2.5 py-1 text-xs text-neutral-500 dark:text-neutral-400"
          >
            ✕
          </button>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          {org.members.map((m) => (
            <Link
              key={m.id}
              href={`/people/${m.id}`}
              className="flex items-baseline gap-2 rounded-lg px-1 py-0.5 text-sm text-neutral-900 dark:text-neutral-50 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            >
              <span className="font-medium">{m.name}</span>
              {m.role && (
                <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {m.role}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const p = entry.person;
  const group = groups.find((g) => g.id === p.group_id) ?? null;

  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-bold text-neutral-900 dark:text-neutral-50">
            {p.name}
            {group && (
              <span
                aria-label={group.name}
                title={group.name}
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: group.color }}
              />
            )}
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {[p.role, p.company].filter(Boolean).join(" · ") || "No role noted"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onUnpin(p.id)}
          aria-label={`Unpin ${p.name}`}
          className="shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-700 px-2.5 py-1 text-xs text-neutral-500 dark:text-neutral-400"
        >
          ✕
        </button>
      </div>
      {p.met_at && (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">Met at {p.met_at}</p>
      )}
      <ContactChips person={p} className="mt-1.5" />
      {p.notes && (
        <p className="mt-2 line-clamp-3 text-sm text-neutral-700 dark:text-neutral-200">
          {p.notes}
        </p>
      )}
      <Link
        href={`/people/${p.id}`}
        className="mt-3 inline-block text-xs font-medium text-neutral-900 dark:text-neutral-50 underline underline-offset-2"
      >
        Full details →
      </Link>
    </div>
  );
}
