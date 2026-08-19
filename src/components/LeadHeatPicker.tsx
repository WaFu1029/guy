"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateLeadHeat } from "@/app/people/actions";

const OPTIONS = [1, 2, 3, 4, 5] as const;

export function heatLabel(heat: number | null | undefined): string {
  if (heat == null) return "unrated";
  return heat >= 4 ? "hot" : heat >= 3 ? "warm" : "cold";
}

// The 1–5 lead-heat rating, editable in place. Clicking the current rating
// clears it back to unrated. Saves immediately — there's nothing to batch.
export function LeadHeatPicker({
  personId,
  heat: initialHeat,
}: {
  personId: string;
  heat: number | null;
}) {
  const router = useRouter();
  const [heat, setHeat] = useState<number | null>(initialHeat);
  const [error, setError] = useState<string | null>(null);

  const pick = async (next: number | null) => {
    const previous = heat;
    setHeat(next);
    setError(null);
    try {
      await updateLeadHeat(personId, next);
      router.refresh();
    } catch (err) {
      setHeat(previous);
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  };

  return (
    <div className="mt-2">
      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Lead heat</p>
      <div className="mt-1.5 flex items-center gap-2">
        {OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => pick(heat === n ? null : n)}
            aria-pressed={heat === n}
            aria-label={`Lead heat ${n} of 5`}
            className={
              "h-8 w-8 rounded-full text-xs font-medium " +
              (heat !== null && n <= heat
                ? "bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900"
                : "bg-white text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500")
            }
          >
            {n}
          </button>
        ))}
        <span className="ml-1 text-xs text-neutral-500 dark:text-neutral-400">
          {heatLabel(heat)}
        </span>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
