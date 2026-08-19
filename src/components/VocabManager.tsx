"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addVocabAliases,
  addVocabTerm,
  deleteVocabTerm,
  removeVocabAlias,
} from "@/app/vocab/actions";
import { normalizeAlias } from "@/lib/vocab";
import type { VocabTerm } from "@/types/database";

// Say the term a few times; whatever the recognizer produces that isn't
// already known gets stored as an alias. Matching the recognizer's actual
// output beats guessing at phonetics, because the mangling is specific to
// this user's voice, accent, and microphone.
function TeachButton({
  term,
  onHeard,
}: {
  term: VocabTerm;
  onHeard: (heard: string[]) => void;
}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const heardRef = useRef<string[]>([]);

  const stop = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    const heard = heardRef.current;
    heardRef.current = [];
    if (heard.length > 0) onHeard(heard);
  };

  const start = () => {
    setError(null);
    const Ctor =
      typeof window !== "undefined"
        ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
        : undefined;
    if (!Ctor) {
      setError("Voice needs Chrome or another browser with the Web Speech API.");
      return;
    }
    const recognition = new Ctor();
    recognition.continuous = true;
    // Interim guesses churn mid-word; only settled results are real output.
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) heardRef.current.push(result[0].transcript.trim());
      }
    };
    recognition.onerror = (event) => {
      setError(`Speech recognition error: ${event.error}`);
      setListening(false);
    };
    heardRef.current = [];
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-label={listening ? `Stop teaching ${term.term}` : `Teach ${term.term}`}
        className={
          "shrink-0 rounded-full px-3 py-1 text-xs font-medium " +
          (listening
            ? "animate-pulse bg-red-600 text-neutral-50"
            : "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200")
        }
      >
        {listening ? "Stop" : "Teach"}
      </button>
      {listening && (
        <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
          say it 2–3 times
        </span>
      )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}

// A long vocabulary shouldn't push the contact book off the screen.
const VISIBLE_TERMS = 3;

// Manage the spoken-word canon. Anything listed here is handed to the voice
// extractor as a correct spelling to snap near-misses onto, which is the only
// fix for a name the transcriber refuses to hear ("Bangle" -> "bungle").
export function VocabManager({ terms }: { terms: VocabTerm[] }) {
  const router = useRouter();
  // The list renders from local state so a mutation shows up immediately.
  // router.refresh() still runs to reconcile with the server, but waiting on
  // it left removed aliases on screen — you'd click the same chip repeatedly
  // and every call after the first was a no-op.
  const [items, setItems] = useState(terms);
  const [syncedTerms, setSyncedTerms] = useState(terms);
  if (syncedTerms !== terms) {
    // Server sent a new list — adopt it (React's adjust-state-during-render).
    setSyncedTerms(terms);
    setItems(terms);
  }
  const [term, setTerm] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!term.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await addVocabTerm(term, hint);
      setItems((cur) => (cur.some((t) => t.id === created.id) ? cur : [...cur, created]));
      setTerm("");
      setHint("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add term");
    } finally {
      setBusy(false);
    }
  };

  const teach = async (t: VocabTerm, heard: string[]) => {
    setError(null);
    // A recognizer that already gets the term right teaches nothing.
    const fresh = heard.filter((h) => normalizeAlias(h) !== normalizeAlias(t.term));
    if (fresh.length === 0) {
      setError(`Heard it correctly as "${t.term}" — nothing to teach.`);
      return;
    }
    try {
      const merged = await addVocabAliases(t.id, fresh);
      setItems((cur) =>
        cur.map((item) => (item.id === t.id ? { ...item, aliases: merged } : item))
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save what was heard");
    }
  };

  const dropAlias = async (id: string, alias: string) => {
    setError(null);
    try {
      setItems((cur) =>
        cur.map((item) =>
          item.id === id
            ? {
                ...item,
                aliases: item.aliases.filter(
                  (a) => normalizeAlias(a) !== normalizeAlias(alias)
                ),
              }
            : item
        )
      );
      await removeVocabAlias(id, alias);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      setItems((cur) => cur.filter((t) => t.id !== id));
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
        want them, then hit <span className="font-medium">Teach</span> and say the
        term a few times — whatever the recognizer mishears becomes a known
        alias, and the extractor maps it back to your spelling.
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

      {items.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {(expanded ? items : items.slice(0, VISIBLE_TERMS)).map((t) => (
            <div
              key={t.id}
              className="flex items-start justify-between gap-3 rounded-xl bg-white dark:bg-neutral-800 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-neutral-900 dark:text-neutral-50">{t.term}</p>
                {t.hint && (
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{t.hint}</p>
                )}
                {t.aliases.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                      heard as
                    </span>
                    {t.aliases.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => dropAlias(t.id, a)}
                        title={`Remove "${a}"`}
                        className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
                      >
                        {a} ✕
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-start gap-1.5">
                <TeachButton term={t} onHeard={(heard) => teach(t, heard)} />
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  aria-label={`Remove ${t.term}`}
                  className="shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-700 px-2.5 py-1 text-xs text-neutral-500 dark:text-neutral-400"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {items.length > VISIBLE_TERMS && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="self-start text-xs text-neutral-500 dark:text-neutral-400 underline underline-offset-2"
            >
              {expanded
                ? "Show less"
                : `Show all ${items.length} (${items.length - VISIBLE_TERMS} more)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
