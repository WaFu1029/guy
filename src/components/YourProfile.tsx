"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/app/account/actions";
import type { Profile } from "@/types/database";

type Editable = { name: string; role: string; school: string; company: string };

const ROWS: { key: keyof Editable; label: string; placeholder: string }[] = [
  { key: "name", label: "Name", placeholder: "your name" },
  { key: "role", label: "What you do", placeholder: "what you work on" },
  { key: "school", label: "School", placeholder: "where you studied" },
  { key: "company", label: "Company", placeholder: "where you work" },
];

// The user's own details. Name labels the You node in the graph; school and
// company let You show up inside the org hubs alongside everyone you've met.
export function YourProfile({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const initial: Editable = {
    name: profile?.name ?? "",
    role: profile?.role ?? "",
    school: profile?.school ?? "",
    company: profile?.company ?? "",
  };
  const [fields, setFields] = useState<Editable>(initial);
  const [saved, setSaved] = useState<Editable>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = ROWS.some((r) => fields[r.key] !== saved[r.key]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateProfile(fields);
      setSaved(fields);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-2">
        {ROWS.map(({ key, label, placeholder }) => (
          <label key={key} className="block">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
            <input
              value={fields[key]}
              onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              className="mt-1 w-full rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
            />
          </label>
        ))}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {dirty && (
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="mt-3 rounded-full bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 px-5 py-2 text-sm font-medium text-neutral-50 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      )}
    </div>
  );
}
