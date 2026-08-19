"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addVocabTerm, deleteVocabTerm } from "@/app/vocab/actions";
import type { VocabTerm } from "@/types/database";

// Manage the spoken-word canon. Anything listed here is handed to the voice
// extractor as a correct spelling to snap near-misses onto, which is the only
// fix for a name the transcriber refuses to hear ("Bangle" -> "bungle").
export function VocabManager({ terms }: { terms: VocabTerm[] }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!term.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addVocabTerm(term, hint);
      setTerm("");
      setHint("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add term");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteVocabTerm(id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove term");
    }
  };

  const input =
    "w-full rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300";

  return (
    <div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Names and terms voice capture keeps getting wrong. Spell them the way you
        want them; the extractor snaps close-sounding words onto these.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="mt-2 flex flex-col gap-2 sm:flex-row"
      >
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Po-Shen Loh"
          className={input}
        />
        <input
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="sounds like PO-shen LOH (optional)"
          className={input}
        />
        <button
          type="submit"
          disabled={busy || !term.trim()}
          className="shrink-0 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-50 disabled:opacity-30 dark:bg-neutral-100 dark:text-neutral-900"
        >
          Add
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {terms.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {terms.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-white dark:bg-neutral-800 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-neutral-900 dark:text-neutral-50">{t.term}</p>
                {t.hint && (
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{t.hint}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label={`Remove ${t.term}`}
                className="shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-700 px-2.5 py-1 text-xs text-neutral-500 dark:text-neutral-400"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
