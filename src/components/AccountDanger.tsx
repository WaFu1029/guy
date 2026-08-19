"use client";

import { useState } from "react";
import { deleteAllData } from "@/app/account/actions";
import { signOut } from "@/app/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function AccountDanger() {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wipe = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAllData();
    } catch (err) {
      // redirect() throws internally on success — only surface real failures.
      if (err instanceof Error && !err.message.includes("NEXT_REDIRECT")) {
        setError(err.message);
        setBusy(false);
        setAsking(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <form action={signOut}>
        <button
          type="submit"
          className="w-full rounded-full bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:text-neutral-50 py-3 text-sm font-medium text-neutral-50"
        >
          Sign out
        </button>
      </form>
      <button
        type="button"
        disabled={busy}
        onClick={() => setAsking(true)}
        className="w-full rounded-full border border-red-300 dark:border-red-500/30 py-3 text-sm font-medium text-red-600 dark:text-red-400 disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Delete all data"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ConfirmDialog
        open={asking}
        busy={busy}
        title="Delete all your data?"
        body="Every contact, connection, group, and reminder is permanently removed. This cannot be undone."
        confirmLabel="Delete everything"
        onConfirm={wipe}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}
