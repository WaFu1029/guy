"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePersonGroup } from "@/app/people/actions";
import type { Group } from "@/types/database";

// Group membership, editable from the profile. Mirrors the chip row in the log
// form so the same choice looks the same wherever you make it; clicking the
// active group clears it, since ungrouped is a valid state.
export function PersonGroupPicker({
  personId,
  groupId: initialGroupId,
  groups,
}: {
  personId: string;
  groupId: string | null;
  groups: Group[];
}) {
  const router = useRouter();
  const [groupId, setGroupId] = useState(initialGroupId);
  const [error, setError] = useState<string | null>(null);

  if (groups.length === 0) return null;

  const pick = async (next: string | null) => {
    const previous = groupId;
    setGroupId(next);
    setError(null);
    try {
      await updatePersonGroup(personId, next);
      router.refresh();
    } catch (err) {
      setGroupId(previous);
      setError(err instanceof Error ? err.message : "Failed to change group");
    }
  };

  return (
    <div className="mt-3">
      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Group</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {groups.map((g) => {
          const active = groupId === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => pick(active ? null : g.id)}
              aria-pressed={active}
              className={
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs " +
                (active
                  ? "bg-neutral-900 font-medium text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900"
                  : "bg-white text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300")
              }
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: g.color }}
              />
              {g.name}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
