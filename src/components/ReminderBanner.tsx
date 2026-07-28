"use client";

import Link from "next/link";
import { FollowUpActions } from "@/components/FollowUpActions";
import type { FollowUp } from "@/types/database";

export type DueFollowUp = FollowUp & { person_name: string };

export function ReminderBanner({ followUps }: { followUps: DueFollowUp[] }) {
  if (followUps.length === 0) return null;

  return (
    <div className="mx-auto mt-6 flex max-w-3xl flex-col gap-3 rounded-xl border border-amber-900/50 bg-amber-950/30 p-4">
      <p className="text-sm font-medium text-amber-300">
        {followUps.length} follow-up{followUps.length > 1 ? "s" : ""} due
      </p>
      {followUps.map((f) => (
        <div
          key={f.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-amber-900/40 bg-neutral-950 p-3"
        >
          <div>
            <Link href={`/people/${f.person_id}`} className="text-sm font-medium text-neutral-50 hover:underline">
              {f.person_name}
            </Link>
            {f.notes && <p className="mt-1 text-xs text-neutral-400">{f.notes}</p>}
          </div>
          <FollowUpActions followUpId={f.id} />
        </div>
      ))}
    </div>
  );
}
