"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createFollowUp, updateFollowUp } from "@/app/follow-ups/actions";
import { toLocalInput } from "@/lib/localTime";
import { FollowUpActions } from "@/components/FollowUpActions";
import type { FollowUp } from "@/types/database";

// Same timings the log form offers, so scheduling reads the same in both places.
const WHEN_OPTIONS = [
  { label: "Tonight", hours: 8 },
  { label: "1 day", hours: 24 },
  { label: "2 days", hours: 48 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
  { label: "2 weeks", hours: 336 },
  { label: "1 month", hours: 720 },
  { label: "3 months", hours: 2160 },
];

const whenLabel = (hours: number) =>
  WHEN_OPTIONS.find((o) => o.hours === hours)?.label.toLowerCase() ?? "later";

const STATUS_LABEL: Record<FollowUp["status"], string> = {
  pending: "Due",
  snoozed: "Snoozed until",
  completed: "Done — was due",
  dismissed: "Dismissed — was due",
};

// The follow-up panel on a person's profile: what's scheduled, and a form to
// schedule more. Always rendered, even with nothing scheduled — an empty panel
// is what tells you the option exists.
export function PersonFollowUps({
  personId,
  personName,
  followUps,
}: {
  personId: string;
  personName: string;
  followUps: FollowUp[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(followUps);
  const [synced, setSynced] = useState(followUps);
  if (synced !== followUps) {
    setSynced(followUps);
    setItems(followUps);
  }

  // Collapsed until asked for: the scheduler is an action you go looking for,
  // not something the panel should always be showing.
  const [composing, setComposing] = useState(false);
  const [hours, setHours] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline editor for one follow-up at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDue, setEditDue] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const startEdit = (f: FollowUp) => {
    setEditingId(f.id);
    setEditDue(toLocalInput(f.due_at));
    setEditNotes(f.notes ?? "");
    setError(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editDue) return;
    setEditBusy(true);
    setError(null);
    try {
      // datetime-local is local wall time; Date parses it as such.
      const updated = await updateFollowUp(editingId, {
        dueAt: new Date(editDue).toISOString(),
        notes: editNotes,
      });
      setItems((cur) => cur.map((f) => (f.id === updated.id ? updated : f)));
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setEditBusy(false);
    }
  };

  const schedule = async () => {
    if (hours === null) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createFollowUp(personId, hours, notes);
      setItems((cur) => [created, ...cur]);
      setHours(null);
      setNotes("");
      setComposing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-50">
        Follow-ups
      </p>

      {items.length > 0 ? (
        <ul className="mb-3 flex flex-col gap-2">
          {items.map((f) =>
            editingId === f.id ? (
              <li key={f.id} className="flex flex-col gap-2 rounded-xl bg-white px-3 py-3 text-sm dark:bg-neutral-800">
                <input
                  type="datetime-local"
                  value={editDue}
                  onChange={(e) => setEditDue(e.target.value)}
                  className="w-fit rounded-lg bg-neutral-100 px-2 py-1 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:bg-neutral-700 dark:text-neutral-50 dark:focus:ring-neutral-300"
                />
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="What's the follow-up about? (optional)"
                  className="w-full resize-y rounded-lg bg-neutral-100 px-2 py-1.5 text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:bg-neutral-700 dark:text-neutral-50 dark:placeholder:text-neutral-500 dark:focus:ring-neutral-300"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={editBusy || !editDue}
                    onClick={saveEdit}
                    className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-neutral-50 enabled:hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:enabled:hover:bg-neutral-300"
                  >
                    {editBusy ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-full px-4 py-1.5 text-xs text-neutral-600 ring-1 ring-neutral-300 hover:bg-neutral-100 dark:text-neutral-300 dark:ring-neutral-600 dark:hover:bg-neutral-700"
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ) : (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="text-neutral-700 dark:text-neutral-200">
                  {STATUS_LABEL[f.status]} {new Date(f.due_at).toLocaleString()}
                </p>
                {f.notes && (
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {f.notes}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {(f.status === "pending" || f.status === "snoozed") && (
                  <button
                    type="button"
                    onClick={() => startEdit(f)}
                    className="rounded-full px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-50"
                  >
                    Edit
                  </button>
                )}
                {f.status === "pending" && (
                  <FollowUpActions
                    followUpId={f.id}
                    calendar={{ personId, personName, dueAt: f.due_at, notes: f.notes }}
                  />
                )}
              </div>
            </li>
            )
          )}
        </ul>
      ) : (
        <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
          Nothing scheduled yet. Anything you schedule shows up on your network
          screen when it comes due.
        </p>
      )}

      {!composing ? (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          + Schedule follow-up
        </button>
      ) : (
        <div className="border-t border-neutral-200 pt-3 dark:border-neutral-700">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Remind me about {personName} in…
          </p>

          <div className="mt-1.5 flex flex-wrap gap-2">
            {WHEN_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setHours(hours === opt.hours ? null : opt.hours)}
                className={
                  "rounded-full px-3 py-1.5 text-xs " +
                  (hours === opt.hours
                    ? "bg-neutral-900 font-medium text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900"
                    : "bg-white text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300")
                }
              >
                {opt.label}
              </button>
            ))}
          </div>

          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What's the follow-up about? (optional)"
            className="mt-2 w-full resize-y rounded-xl border-0 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:bg-neutral-800 dark:text-neutral-50 dark:placeholder:text-neutral-500 dark:focus:ring-neutral-300"
          />

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={schedule}
              disabled={busy || hours === null}
              className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-50 disabled:opacity-30 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {busy
                ? "Scheduling…"
                : hours === null
                  ? "Pick a time"
                  : `Schedule for ${whenLabel(hours)}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setComposing(false);
                setHours(null);
                setNotes("");
                setError(null);
              }}
              className="text-xs text-neutral-500 dark:text-neutral-400 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
