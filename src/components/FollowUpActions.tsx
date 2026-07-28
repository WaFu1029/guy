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
        className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300"
      >
        Snooze 1 day
      </button>
      <button
        onClick={async () => {
          await completeFollowUp(followUpId);
          router.refresh();
        }}
        className="rounded-full bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-900"
      >
        Mark done
      </button>
    </div>
  );
}
