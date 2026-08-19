"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePersonFields } from "@/app/people/actions";

// The person's name, editable in place. Renders as the page heading until you
// click it, so the page doesn't look like a form — but a misheard name (the
// common case, given voice capture) is one click from being fixed.
export function PersonNameEdit({
  personId,
  name: initialName,
}: {
  personId: string;
  name: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = async () => {
    const next = name.trim();
    setEditing(false);
    if (!next) {
      // Empty isn't a valid name — snap back rather than reject with an error.
      setName(saved);
      return;
    }
    if (next === saved) {
      setName(next);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updatePersonFields(personId, { name: next });
      setSaved(next);
      setName(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename");
      setName(saved);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setName(saved);
              setEditing(false);
            }
          }}
          aria-label="Name"
          className="w-full rounded-xl bg-white px-2 py-1 text-2xl font-bold text-neutral-900 outline-none ring-2 ring-neutral-900 dark:bg-neutral-800 dark:text-neutral-50 dark:ring-neutral-300"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Click to rename"
          className="group flex w-full items-center gap-2 rounded-xl px-2 py-1 text-left -ml-2 hover:bg-white/60 dark:hover:bg-neutral-800/60"
        >
          <span className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
            {busy ? name : saved}
          </span>
          <span
            aria-hidden
            className="text-xs text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-neutral-500"
          >
            edit
          </span>
        </button>
      )}
      {error && <p className="mt-1 px-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
