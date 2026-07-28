"use client";

import { useRouter } from "next/navigation";
import { completeFollowUp, snoozeFollowUp } from "@/app/follow-ups/actions";

export function FollowUpActions({ followUpId }: { followUpId: string }) {
  const router = useRouter();

  return (
    <div className="flex shrink-0 gap-2">
      <button
        onClick={async () => {
          await snoozeFollowUp(followUpId, 24);
          router.refresh();
        }}
        className="rounded-full border border-neutral-300 dark:border-neutral-500 bg-white dark:bg-neutral-800 px-3 py-1 text-xs text-neutral-900 dark:text-neutral-50"
      >
        Snooze 1 day
      </button>
      <button
        onClick={async () => {
          await completeFollowUp(followUpId);
          router.refresh();
        }}
        className="rounded-full bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 px-3 py-1 text-xs font-medium text-neutral-50 ring-1 ring-neutral-700"
      >
        Mark done
      </button>
    </div>
  );
}
