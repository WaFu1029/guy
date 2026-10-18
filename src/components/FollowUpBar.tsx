"use client";

import { useState } from "react";
import Link from "next/link";
import { FollowUpActions } from "@/components/FollowUpActions";
import type { FollowUp } from "@/types/database";

export type DueFollowUp = FollowUp & { person_name: string };

// "Tonight 8:40 PM" style. Formatted in the viewer's timezone, so the server
// render can differ — suppressHydrationWarning on the element covers that.
function dueLabel(dueAt: string): string {
  const d = new Date(dueAt);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today ${time}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function FollowUpRow({ f, upcoming = false }: { f: DueFollowUp; upcoming?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-800 p-3">
      <div className="min-w-0">
        <Link
          href={`/people/${f.person_id}`}
          className="text-sm font-medium text-neutral-50 hover:underline"
        >
          {f.person_name}
        </Link>
        {upcoming && (
          <p suppressHydrationWarning className="mt-0.5 text-xs text-neutral-400">
            {dueLabel(f.due_at)}
          </p>
        )}
        {f.notes && (
          <p className="mt-0.5 truncate text-xs text-neutral-400 dark:text-neutral-500">
            {f.notes}
          </p>
        )}
      </div>
      <FollowUpActions
        followUpId={f.id}
        calendar={{
          personId: f.person_id,
          personName: f.person_name,
          dueAt: f.due_at,
          notes: f.notes,
        }}
      />
    </div>
  );
}

// The black follow-up surface. Collapsed (mobile, docked under the network
// card) it shows a one-line status that expands on tap; as a panel (desktop
// right column, bottom half) the list is always open and scrolls in place.
export function FollowUpBar({
  followUps,
  upcoming = [],
  alwaysOpen = false,
  className,
}: {
  followUps: DueFollowUp[];
  // Pending but not yet due — listed under the due ones so a follow-up the
  // person page shows never seems to be missing here.
  upcoming?: DueFollowUp[];
  alwaysOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const count = followUps.length;
  const label =
    (count === 0 ? "No follow-ups due" : `${count} follow-up${count > 1 ? "s" : ""} due`) +
    (upcoming.length > 0 ? ` · ${upcoming.length} upcoming` : "");
  const hasAny = count > 0 || upcoming.length > 0;
  const upcomingList =
    upcoming.length > 0 ? (
      <>
        <p className="mt-2 px-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
          Upcoming
        </p>
        {upcoming.map((f) => (
          <FollowUpRow key={f.id} f={f} upcoming />
        ))}
      </>
    ) : null;

  if (alwaysOpen) {
    return (
      <div
        className={
          "flex min-h-0 flex-col overflow-hidden rounded-3xl bg-neutral-900 text-neutral-50 " +
          (className ?? "")
        }
      >
        <p className="shrink-0 px-5 pb-3 pt-4 text-sm font-medium">{label}</p>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
          {count === 0 ? (
            <p className="px-1 text-xs text-neutral-500">
              {upcoming.length > 0
                ? "Nothing due right now."
                : "Nothing due right now. Follow-ups you schedule show up here."}
            </p>
          ) : (
            followUps.map((f) => <FollowUpRow key={f.id} f={f} />)
          )}
          {upcomingList}
        </div>
      </div>
    );
  }

  return (
    <div className={"rounded-3xl bg-neutral-900 text-neutral-50 " + (className ?? "")}>
      <button
        type="button"
        onClick={() => hasAny && setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-sm font-medium">{label}</span>
        {hasAny && (
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            {open ? "Hide" : "Show"}
          </span>
        )}
      </button>
      {open && hasAny && (
        <div className="flex flex-col gap-2 px-4 pb-4">
          {followUps.map((f) => (
            <FollowUpRow key={f.id} f={f} />
          ))}
          {upcomingList}
        </div>
      )}
    </div>
  );
}
