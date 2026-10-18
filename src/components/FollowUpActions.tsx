"use client";

import { useRouter } from "next/navigation";
import { completeFollowUp, snoozeFollowUp } from "@/app/follow-ups/actions";
import { followUpCalendarUrl } from "@/lib/gcal";

export function FollowUpActions({
  followUpId,
  calendar,
}: {
  followUpId: string;
  // When given, adds a button that opens this follow-up as a pre-filled
  // Google Calendar event.
  calendar?: { personId: string; personName: string; dueAt: string; notes: string | null };
}) {
  const router = useRouter();

  return (
    <div className="flex shrink-0 gap-2">
      {calendar && (
        <button
          type="button"
          onClick={() => window.open(followUpCalendarUrl(calendar), "_blank", "noopener")}
          aria-label="Add to Google Calendar"
          title="Add to Google Calendar"
          className="flex items-center rounded-full border border-neutral-300 dark:border-neutral-500 bg-white dark:bg-neutral-800 px-2 py-1 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="3" width="12" height="11" rx="2" />
            <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3M8 8.5v3M6.5 10h3" strokeLinecap="round" />
          </svg>
        </button>
      )}
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
