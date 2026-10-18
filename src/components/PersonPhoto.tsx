"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removePersonPhoto, setPersonPhoto } from "@/app/people/actions";
import { PhotoCapture } from "@/components/PhotoCapture";

// The person's photo on their profile — or their initials until one is taken.
// Click to take or upload a new one.
export function PersonPhoto({
  personId,
  name,
  url,
}: {
  personId: string;
  name: string;
  // Signed URL for the stored photo; null when there isn't one.
  url: string | null;
}) {
  const router = useRouter();
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = preview ?? url;

  const save = async (photo: Blob) => {
    setCapturing(false);
    setBusy(true);
    setError(null);
    const local = URL.createObjectURL(photo);
    setPreview(local);
    try {
      const form = new FormData();
      form.append("photo", photo, "photo.jpg");
      await setPersonPhoto(personId, form);
      router.refresh();
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Failed to save photo");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await removePersonPhoto(personId);
      setPreview(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove photo");
    } finally {
      setBusy(false);
    }
  };

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => setCapturing(true)}
        disabled={busy}
        aria-label={shown ? "Change photo" : "Add photo"}
        className="group relative h-20 w-20 overflow-hidden rounded-full bg-white ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700"
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; next/image would need the host configured
          <img src={shown} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-neutral-400 dark:text-neutral-500">
            {initials}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          {busy ? "Saving…" : shown ? "Change" : "Add photo"}
        </span>
      </button>
      {shown && !busy && (
        <button
          type="button"
          onClick={remove}
          className="text-xs text-neutral-400 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-50"
        >
          Remove
        </button>
      )}
      {error && <p className="max-w-32 text-center text-xs text-red-600">{error}</p>}
      {capturing && <PhotoCapture onCapture={save} onClose={() => setCapturing(false)} />}
    </div>
  );
}
