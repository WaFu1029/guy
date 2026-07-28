"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deletePerson } from "@/app/account/actions";
import type { Group, Person } from "@/types/database";

// Phone-book style contact list for the Account tab: search across name,
// role, company, event, and contact handles; tap a row for full details;
// delete removes the person (their edges and reminders cascade).
export function ContactBook({ people, groups }: { people: Person[]; groups: Group[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted;
    return sorted.filter((p) =>
      [p.name, p.role, p.company, p.school, p.met_at, p.phone, p.email, p.instagram, p.twitter]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    );
  }, [people, query]);

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search contacts…"
        className="w-full rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
      />
      {filtered.length === 0 && (
        <p className="px-1 py-2 text-sm text-neutral-500 dark:text-neutral-400">
          {people.length === 0 ? "No contacts yet." : "No matches."}
        </p>
      )}
      {filtered.map((p) => {
        const group = p.group_id ? groupById.get(p.group_id) : null;
        return (
          <div key={p.id} className="flex items-center gap-3 rounded-xl bg-white dark:bg-neutral-800 px-3 py-2">
            <Link href={`/people/${p.id}`} className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                {p.name}
                {group && (
                  <span
                    aria-label={group.name}
                    title={group.name}
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                )}
              </p>
              <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                {[p.role, p.company].filter(Boolean).join(" · ") || "—"}
                {p.phone ? ` · ${p.phone}` : p.email ? ` · ${p.email}` : ""}
              </p>
            </Link>
            <button
              type="button"
              disabled={busyId === p.id}
              onClick={async () => {
                if (!window.confirm(`Delete ${p.name}? Their connections and reminders go too.`)) {
                  return;
                }
                setBusyId(p.id);
                setError(null);
                try {
                  await deletePerson(p.id);
                  router.refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to delete");
                } finally {
                  setBusyId(null);
                }
              }}
              className="shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-700 px-2.5 py-1 text-xs text-neutral-500 dark:text-neutral-400 disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        );
      })}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
