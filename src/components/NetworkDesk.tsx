"use client";

import { useMemo, useState } from "react";
import { ConnectionGraph } from "@/components/ConnectionGraph";
import { FollowUpBar, type DueFollowUp } from "@/components/FollowUpBar";
import { PinnedCard } from "@/components/PinnedCard";
import { deriveOrgHubs, resolvePins } from "@/lib/orgHubs";
import type { Person, Connection, Group, Profile } from "@/types/database";

// Desktop network view: graph on the left, right column split in half —
// detail panels for the pinned nodes on top, due follow-ups underneath.
// Below `lg` it collapses back to the phone layout (full-bleed graph with the
// docked card stack, follow-up bar beneath), so pin state lives here and is
// handed down to the graph rather than owned by it.
export function NetworkDesk({
  people,
  connections,
  groups,
  followUps,
  profile,
}: {
  people: Person[];
  connections: Connection[];
  groups: Group[];
  followUps: DueFollowUp[];
  profile: Profile | null;
}) {
  const [pinnedIds, setPinnedIds] = useState<readonly string[]>([]);
  const orgs = useMemo(() => deriveOrgHubs(people, profile), [people, profile]);
  const pinnedEntries = useMemo(
    () => resolvePins(pinnedIds, people, orgs),
    [pinnedIds, people, orgs]
  );
  const unpin = (id: string) => setPinnedIds((cur) => cur.filter((x) => x !== id));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <div className="min-h-0 flex-1">
        <ConnectionGraph
          people={people}
          connections={connections}
          groups={groups}
          profile={profile}
          pinnedIds={pinnedIds}
          onPinnedIdsChange={setPinnedIds}
          // The side panel owns the cards from `lg` up.
          cardsClassName="lg:hidden"
        />
      </div>

      {/* Phone: the collapsed bar sits under the graph. */}
      <div className="shrink-0 lg:hidden">
        <FollowUpBar followUps={followUps} />
      </div>

      {/* Desktop: half detail panels, half follow-ups. */}
      <div className="hidden min-h-0 w-[360px] shrink-0 flex-col gap-3 lg:flex xl:w-[420px]">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-neutral-100 dark:bg-neutral-900">
          <div className="flex shrink-0 items-baseline justify-between px-5 pb-2 pt-4">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              {pinnedEntries.length === 0
                ? "Details"
                : `${pinnedEntries.length} selected`}
            </p>
            {pinnedEntries.length > 0 && (
              <button
                type="button"
                onClick={() => setPinnedIds([])}
                className="text-xs text-neutral-500 dark:text-neutral-400 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
            {pinnedEntries.length === 0 ? (
              <p className="px-2 text-xs text-neutral-500 dark:text-neutral-400">
                Click a person or an org in the network to open their details here.
                Click again to dismiss.
              </p>
            ) : (
              pinnedEntries.map((entry) => (
                <PinnedCard
                  key={entry.type === "org" ? entry.org.id : entry.person.id}
                  entry={entry}
                  groups={groups}
                  onUnpin={unpin}
                  className="shrink-0 rounded-2xl bg-white dark:bg-neutral-800 p-4 shadow-sm"
                />
              ))
            )}
          </div>
        </div>
        <FollowUpBar followUps={followUps} alwaysOpen className="flex-1" />
      </div>
    </div>
  );
}
