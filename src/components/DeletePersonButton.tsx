"use client";

import { useState } from "react";
import { deletePersonAndGoHome } from "@/app/account/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function DeletePersonButton({
  personId,
  personName,
}: {
  personId: string;
  personName: string;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      // Server action deletes and redirects; the redirect surfaces as a
      // framework-internal throw, not a real error.
      await deletePersonAndGoHome(personId);
    } catch (err) {
      if (err instanceof Error && !err.message.includes("NEXT_REDIRECT")) {
        setError(err.message);
        setBusy(false);
        setAsking(false);
      }
    }
  };

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => setAsking(true)}
        className="w-full rounded-full border border-red-300 dark:border-red-500/30 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Delete contact"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <ConfirmDialog
        open={asking}
        busy={busy}
        title={`Delete ${personName}?`}
        body="Their connections and reminders are removed too."
        confirmLabel="Delete contact"
        onConfirm={remove}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}
