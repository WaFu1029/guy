"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePersonFields } from "@/app/people/actions";
import type { Person } from "@/types/database";

type Editable = {
  role: string;
  how_they_help: string;
  company: string;
  school: string;
  met_at: string;
  phone: string;
  email: string;
  instagram: string;
  twitter: string;
  notes: string;
};

const ROWS: { key: keyof Editable; label: string }[] = [
  { key: "role", label: "Role" },
  { key: "how_they_help", label: "How they can help" },
  { key: "company", label: "Company" },
  { key: "school", label: "School" },
  { key: "met_at", label: "Met because" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "instagram", label: "Instagram" },
  { key: "twitter", label: "Twitter / X" },
];

// Inline-editable profile fields + notes. Save appears once anything changes.
export function ProfileFields({ person }: { person: Person }) {
  const router = useRouter();
  const initial: Editable = {
    role: person.role ?? "",
    how_they_help: person.how_they_help ?? "",
    company: person.company ?? "",
    school: person.school ?? "",
    met_at: person.met_at ?? "",
    phone: person.phone ?? "",
    email: person.email ?? "",
    instagram: person.instagram ?? "",
    twitter: person.twitter ?? "",
    notes: person.notes ?? "",
  };
  const [fields, setFields] = useState<Editable>(initial);
  const [saved, setSaved] = useState<Editable>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = ROWS.some((r) => fields[r.key] !== saved[r.key]) || fields.notes !== saved.notes;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updatePersonFields(person.id, fields);
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
      <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-sm">
        {ROWS.map(({ key, label }) => (
          <div key={key} className="contents">
            <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
            <input
              value={fields[key]}
              onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
              placeholder="—"
              className="w-full rounded-lg border-0 bg-transparent px-2 py-1 text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-300 dark:placeholder:text-neutral-600 focus:bg-white dark:focus:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            />
          </div>
        ))}
      </div>

      <div className="mt-4">
        <h2 className="mb-1 text-sm font-semibold text-neutral-900 dark:text-neutral-50">Notes</h2>
        <textarea
          value={fields.notes}
          onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
          placeholder="—"
          rows={Math.max(3, fields.notes.split("\n").length)}
          className="w-full rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 placeholder:text-neutral-300 dark:placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
        />
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {dirty && (
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="mt-2 rounded-full bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 px-5 py-2 text-sm font-medium text-neutral-50 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      )}
    </div>
  );
}
