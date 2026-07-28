"use client";

import { useState } from "react";
import { updateGroup } from "@/app/groups/actions";
import { GROUP_COLOR_PRESETS } from "@/lib/groupColors";
import type { Group } from "@/types/database";

// Account-section group editor: tap Edit to change a group's name, optional
// description, and color. Color changes apply immediately; name/description
// save on the Save button.
export function GroupManager({ groups: initialGroups }: { groups: Group[] }) {
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyUpdate = (updated: Group) =>
    setGroups((cur) => cur.map((g) => (g.id === updated.id ? updated : g)));

  const openEditor = (g: Group) => {
    setOpenId(g.id);
    setDraftName(g.name);
    setDraftDescription(g.description ?? "");
    setError(null);
  };

  if (groups.length === 0) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">No groups yet — create one from the Log tab.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => (
        <div key={g.id} className={"rounded-xl bg-white dark:bg-neutral-800 " + (openId === g.id ? "p-4" : "px-3 py-2.5")}>
          <button
            type="button"
            onClick={() => (openId === g.id ? setOpenId(null) : openEditor(g))}
            className="flex w-full items-center gap-2 text-left text-sm text-neutral-900 dark:text-neutral-50"
          >
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: g.color }}
            />
            <span className="min-w-0">
              <span className="block truncate font-medium">{g.name}</span>
              {g.description && openId !== g.id && (
                <span className="block truncate text-xs font-normal text-neutral-500 dark:text-neutral-400">
                  {g.description}
                </span>
              )}
            </span>
            <span className="ml-auto shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
              {openId === g.id ? "Close" : "Edit"}
            </span>
          </button>
          {openId === g.id && (
            <div className="mt-4 flex flex-col gap-3">
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Group name"
                className="w-full rounded-lg border border-neutral-200 dark:border-neutral-600 px-3.5 py-2.5 text-sm text-neutral-900 dark:text-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
              />
              <input
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full rounded-lg border border-neutral-200 dark:border-neutral-600 px-3.5 py-2.5 text-sm text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
              />
              <div className="flex flex-wrap items-center gap-3 py-2">
                {GROUP_COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Set color ${color}`}
                    onClick={async () => {
                      try {
                        setError(null);
                        applyUpdate(await updateGroup(g.id, { color }));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to update color");
                      }
                    }}
                    className={
                      "h-7 w-7 rounded-full " +
                      (g.color === color ? "ring-2 ring-neutral-900 dark:ring-neutral-100 ring-offset-2" : "")
                    }
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <button
                type="button"
                disabled={saving || !draftName.trim()}
                onClick={async () => {
                  setSaving(true);
                  setError(null);
                  try {
                    applyUpdate(
                      await updateGroup(g.id, { name: draftName, description: draftDescription })
                    );
                    setOpenId(null);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to save");
                  } finally {
                    setSaving(false);
                  }
                }}
                className="mt-1 self-start rounded-full bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:text-neutral-50 px-5 py-2.5 text-xs font-medium text-neutral-50 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
