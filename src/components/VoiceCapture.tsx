"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveConnection } from "@/app/capture/actions";
import type { ExtractedConnection } from "@/types/extraction";
import type { RelationshipType } from "@/types/database";

type Status = "idle" | "recording" | "processing" | "review" | "saving" | "done" | "error";

const RELATIONSHIP_OPTIONS: { value: RelationshipType; label: string }[] = [
  { value: "met_at_event", label: "Met at an event" },
  { value: "introduced_by", label: "Introduced by someone" },
  { value: "works_with", label: "Works with someone" },
  { value: "other", label: "Other" },
];

const FOLLOW_UP_OPTIONS = [
  { label: "No reminder", hours: undefined },
  { label: "12 hours", hours: 12 },
  { label: "1 day", hours: 24 },
  { label: "2 days", hours: 48 },
  { label: "1 week", hours: 168 },
];

export function VoiceCapture() {
  const router = useRouter();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedConnection | null>(null);
  const [followUpHours, setFollowUpHours] = useState<number | undefined>(undefined);
  const [customHours, setCustomHours] = useState("");
  const [supported, setSupported] = useState(true);

  function getRecognition(): SpeechRecognitionInstance | null {
    if (typeof window === "undefined") return null;
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setSupported(false);
      return null;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    return recognition;
  }

  function startRecording() {
    setError(null);
    setTranscript("");
    setExtracted(null);
    const recognition = getRecognition();
    if (!recognition) return;

    let finalTranscript = "";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript((finalTranscript + interim).trim());
    };

    recognition.onerror = (event) => {
      setError(`Speech recognition error: ${event.error}`);
      setStatus("idle");
    };

    recognition.onend = () => {
      setTranscript(finalTranscript.trim());
    };

    recognitionRef.current = recognition;
    recognition.start();
    setStatus("recording");
  }

  async function stopRecordingAndExtract() {
    recognitionRef.current?.stop();
    setStatus("processing");

    const currentTranscript = transcript.trim();
    if (!currentTranscript) {
      setError("Didn't catch any speech — try again.");
      setStatus("idle");
      return;
    }

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: currentTranscript }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Extraction failed");
      }

      const { extracted: extractedData } = await res.json();
      setExtracted(extractedData);
      setFollowUpHours(extractedData.follow_up_hours);
      setStatus("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
      setStatus("idle");
    }
  }

  async function handleSave() {
    if (!extracted) return;
    setStatus("saving");
    setError(null);

    const finalHours =
      followUpHours === -1 ? (customHours ? Number(customHours) : undefined) : followUpHours;

    try {
      await saveConnection({ ...extracted, follow_up_hours: finalHours }, transcript);
      setStatus("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setStatus("review");
    }
  }

  function reset() {
    setStatus("idle");
    setTranscript("");
    setExtracted(null);
    setFollowUpHours(undefined);
    setCustomHours("");
    setError(null);
  }

  if (!supported) {
    return (
      <p className="text-sm text-red-400">
        Voice capture needs a browser that supports the Web Speech API (Chrome works best). Try
        again there.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {status === "idle" && (
        <button
          onClick={startRecording}
          className="rounded-full bg-neutral-50 px-6 py-3 text-sm font-medium text-neutral-900"
        >
          Start voice note
        </button>
      )}

      {status === "recording" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm text-red-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Recording...
          </div>
          <p className="min-h-16 rounded-md border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-200">
            {transcript || "Say who you just met..."}
          </p>
          <button
            onClick={stopRecordingAndExtract}
            className="rounded-full bg-neutral-50 px-6 py-3 text-sm font-medium text-neutral-900"
          >
            Stop and process
          </button>
        </div>
      )}

      {status === "processing" && <p className="text-sm text-neutral-400">Extracting details...</p>}

      {(status === "review" || status === "saving") && extracted && (
        <div className="flex flex-col gap-3">
          <label className="text-sm text-neutral-300">
            Name
            <input
              value={extracted.name}
              onChange={(e) => setExtracted({ ...extracted, name: e.target.value })}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-50"
            />
          </label>
          <div className="flex gap-3">
            <label className="flex-1 text-sm text-neutral-300">
              Role
              <input
                value={extracted.role ?? ""}
                onChange={(e) => setExtracted({ ...extracted, role: e.target.value })}
                className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-50"
              />
            </label>
            <label className="flex-1 text-sm text-neutral-300">
              Company
              <input
                value={extracted.company ?? ""}
                onChange={(e) => setExtracted({ ...extracted, company: e.target.value })}
                className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-50"
              />
            </label>
          </div>
          <label className="text-sm text-neutral-300">
            Met at
            <input
              value={extracted.met_at ?? ""}
              onChange={(e) => setExtracted({ ...extracted, met_at: e.target.value })}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-50"
            />
          </label>
          <label className="text-sm text-neutral-300">
            Notes
            <textarea
              value={extracted.context ?? ""}
              onChange={(e) => setExtracted({ ...extracted, context: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-50"
            />
          </label>
          <label className="text-sm text-neutral-300">
            Relationship
            <select
              value={extracted.relationship_type ?? "met_at_event"}
              onChange={(e) =>
                setExtracted({ ...extracted, relationship_type: e.target.value as RelationshipType })
              }
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-50"
            >
              {RELATIONSHIP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-neutral-300">
            Follow up in
            <select
              value={followUpHours === undefined ? "none" : followUpHours}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "none") setFollowUpHours(undefined);
                else if (val === "custom") setFollowUpHours(-1);
                else setFollowUpHours(Number(val));
              }}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-50"
            >
              {FOLLOW_UP_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.hours ?? "none"}>
                  {opt.label}
                </option>
              ))}
              <option value="custom">Custom (hours)</option>
            </select>
          </label>
          {followUpHours === -1 && (
            <input
              type="number"
              placeholder="Hours from now"
              value={customHours}
              onChange={(e) => setCustomHours(e.target.value)}
              className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-50"
            />
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={status === "saving"}
              className="rounded-full bg-neutral-50 px-6 py-3 text-sm font-medium text-neutral-900 disabled:opacity-50"
            >
              {status === "saving" ? "Saving..." : "Save connection"}
            </button>
            <button
              onClick={reset}
              className="rounded-full border border-neutral-700 px-6 py-3 text-sm text-neutral-300"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {status === "done" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-emerald-400">Connection saved.</p>
          <button
            onClick={reset}
            className="rounded-full bg-neutral-50 px-6 py-3 text-sm font-medium text-neutral-900"
          >
            Record another
          </button>
        </div>
      )}

      {status === "idle" && error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
