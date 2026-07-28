"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { applyPersonUpdate } from "@/app/people/actions";
import type { PersonUpdate } from "@/types/extraction";

type Status = "idle" | "recording" | "processing" | "applying";

// Voice surface on a person's profile: speak what should change ("add a note
// that she's moving to NYC", "remind me in 3 days to send the deck") and the
// parsed update is applied directly.
export function ProfileVoiceEdit({
  personId,
  personName,
  currentNotes = "",
  groupNames = [],
  peopleNames = [],
}: {
  personId: string;
  personName: string;
  currentNotes?: string;
  groupNames?: string[];
  peopleNames?: string[];
}) {
  const router = useRouter();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const transcriptRef = useRef("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string[]>([]);
  const [supported, setSupported] = useState(true);

  function startRecording() {
    setError(null);
    setApplied([]);
    const SpeechRecognitionCtor =
      typeof window !== "undefined"
        ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
        : undefined;
    if (!SpeechRecognitionCtor) {
      setSupported(false);
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = "";
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalTranscript += result[0].transcript + " ";
      }
      transcriptRef.current = finalTranscript.trim();
    };
    recognition.onerror = (event) => {
      setError(`Speech recognition error: ${event.error}`);
      setStatus("idle");
    };

    transcriptRef.current = "";
    recognitionRef.current = recognition;
    recognition.start();
    setStatus("recording");
  }

  async function stopAndApply() {
    recognitionRef.current?.stop();
    setStatus("processing");
    // onresult can land slightly after stop(); give it a beat.
    await new Promise((r) => setTimeout(r, 300));
    const transcript = transcriptRef.current;
    if (!transcript) {
      setError("Didn't catch any speech — try again.");
      setStatus("idle");
      return;
    }

    try {
      const res = await fetch("/api/person-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          personName,
          currentNotes,
          groups: groupNames,
          people: peopleNames,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't understand that");
      }
      const { update } = (await res.json()) as { update: PersonUpdate };
      setStatus("applying");
      const changed = await applyPersonUpdate(personId, update);
      setApplied(changed);
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply");
      setStatus("idle");
    }
  }

  if (!supported) {
    return (
      <p className="text-sm text-red-600">
        Voice needs a browser with the Web Speech API (Chrome works best).
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={status === "processing" || status === "applying"}
        onClick={status === "recording" ? stopAndApply : startRecording}
        aria-label={status === "recording" ? "Stop and apply" : "Start voice edit"}
        className={
          "h-12 w-12 shrink-0 rounded-full disabled:opacity-40 " +
          (status === "recording" ? "animate-pulse bg-red-600" : "bg-neutral-900")
        }
      />
      <div className="min-w-0 text-sm">
        {status === "recording" && <p className="text-red-600">Listening… tap to apply.</p>}
        {status === "processing" && <p className="text-neutral-500 dark:text-neutral-400">Understanding…</p>}
        {status === "applying" && <p className="text-neutral-500 dark:text-neutral-400">Applying…</p>}
        {status === "idle" && applied.length > 0 && (
          <p className="text-emerald-700">{applied.join(" · ")}</p>
        )}
        {status === "idle" && applied.length === 0 && !error && (
          <p className="text-neutral-500 dark:text-neutral-400">
            Tell Guy what to change — a new note, a follow-up, updated contact info.
          </p>
        )}
        {error && <p className="text-red-600">{error}</p>}
      </div>
    </div>
  );
}
