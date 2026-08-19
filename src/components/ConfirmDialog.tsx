"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// In-app confirmation for destructive actions. window.confirm() is a browser
// chrome dialog — it ignores the theme, names the host ("localhost:3001 says"),
// and blocks the main thread. This is the same prompt in the app's own voice.
//
// Rendered through a portal so a dialog opened from inside a transformed or
// clipped container (the graph, a scrolling panel) still covers the viewport.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  // Escape cancels, and the confirm button takes focus on open so the dialog
  // is operable from the keyboard alone.
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  // The portal target only exists in the browser, and `open` gates the work so
  // nothing renders server-side.
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Clicks inside the card must not reach the dismissing backdrop.
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-white dark:bg-neutral-800 p-5 shadow-xl"
      >
        <p className="text-base font-bold text-neutral-900 dark:text-neutral-50">{title}</p>
        {body && (
          <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">{body}</p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded-full bg-neutral-100 dark:bg-neutral-700 py-2.5 text-sm font-medium text-neutral-900 dark:text-neutral-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 rounded-full bg-red-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
