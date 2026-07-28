"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveConnection } from "@/app/log/actions";
import { createGroup } from "@/app/groups/actions";
import type { ExtractedConnection } from "@/types/extraction";
import type { Group } from "@/types/database";

type Status = "idle" | "recording" | "processing" | "saving";

const FOLLOW_UP_OPTIONS = [
  { label: "None", hours: undefined },
  { label: "1 day", hours: 24 },
  { label: "2 days", hours: 48 },
  { label: "1 week", hours: 168 },
];

type Fields = {
  name: string;
  alsoKnows: string;
  whatTheyDo: string;
  company: string;
  school: string;
  event: string;
  phone: string;
  email: string;
  instagram: string;
  twitter: string;
};

const EMPTY_FIELDS: Fields = {
  name: "",
  alsoKnows: "",
  whatTheyDo: "",
  company: "",
  school: "",
  event: "",
  phone: "",
  email: "",
  instagram: "",
  twitter: "",
};

// The Log tab: a plain form plus the big record circle. Speaking fills the
// fields via /api/extract; everything stays editable by hand, and typing
// without recording works too.
export function LogForm({
  groups: initialGroups,
  peopleContext = [],
}: {
  groups: Group[];
  // One summary line per existing contact (name — role · company — notes…).
  peopleContext?: string[];
}) {
  const router = useRouter();
  // Local copy so an inline-created group is selectable immediately.
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const transcriptRef = useRef("");
  const [status, setStatus] = useState<Status>("idle");
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  // Kept from extraction even though the form doesn't show it — the graph and
  // person page still use role.
  const [role, setRole] = useState("");
  const [followUpHours, setFollowUpHours] = useState<number | undefined>(undefined);
  const [followUpAbout, setFollowUpAbout] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [supported, setSupported] = useState(true);
  // Live transcript (finals + interims) streamed into the recording box.
  const [liveTranscript, setLiveTranscript] = useState("");
  // Spoken relationships for "also knows" names (keyed by lowercased name) —
  // the text field carries names only, this carries the edge labels.
  const [alsoKnowsRel, setAlsoKnowsRel] = useState<Record<string, string>>({});

  const set = (key: keyof Fields) => (value: string) =>
    setFields((f) => ({ ...f, [key]: value }));

  function startRecording() {
    setError(null);
    setSaved(false);
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
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalTranscript += result[0].transcript + " ";
        else interim += result[0].transcript;
      }
      transcriptRef.current = finalTranscript.trim();
      setLiveTranscript((finalTranscript + interim).trim());
    };
    recognition.onerror = (event) => {
      setError(`Speech recognition error: ${event.error}`);
      setStatus("idle");
    };

    transcriptRef.current = "";
    setLiveTranscript("");
    recognitionRef.current = recognition;
    recognition.start();
    setStatus("recording");
  }

  async function stopAndExtract() {
    recognitionRef.current?.stop();
    setStatus("processing");

    // onresult can land slightly after stop(); give it a beat.
    await new Promise((r) => setTimeout(r, 300));
    const transcript = transcriptRef.current;
    if (!transcript) {
      setError("Didn't catch any speech — try again or type it in.");
      setStatus("idle");
      return;
    }

    try {
      // Send the current draft + the user's groups and contacts so a second
      // recording merges (pronouns resolve, "put him under builders" works,
      // mentioned names match existing people).
      const draft: Record<string, string> = {};
      if (fields.name.trim()) draft.name = fields.name.trim();
      if (role.trim()) draft.role = role.trim();
      if (fields.company.trim()) draft.company = fields.company.trim();
      if (fields.school.trim()) draft.school = fields.school.trim();
      if (fields.whatTheyDo.trim()) draft.notes = fields.whatTheyDo.trim();
      if (fields.event.trim()) draft.met_because = fields.event.trim();

      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          draft,
          groups: groups.map((g) => g.name),
          people: peopleContext,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Extraction failed");
      }
      const { extracted } = (await res.json()) as { extracted: ExtractedConnection };

      // Merge into the draft instead of replacing it: a non-empty extracted
      // value wins (spoken corrections apply), an omitted one keeps what's
      // there, notes append, and "also knows" unions.
      setFields((cur) => {
        const pick = (next: string | undefined, prev: string) => next?.trim() || prev;
        const union = (prev: string, next: { name: string }[] | undefined) => {
          const seen = new Set(
            prev.split(",").map((n) => n.trim()).filter(Boolean).map((n) => n.toLowerCase())
          );
          const merged = prev.split(",").map((n) => n.trim()).filter(Boolean);
          for (const k of next ?? []) {
            if (!seen.has(k.name.trim().toLowerCase())) merged.push(k.name.trim());
          }
          return merged.join(", ");
        };
        let appended = pick(extracted.context, cur.whatTheyDo);
        const curNotes = cur.whatTheyDo.trim();
        const nextNotes = extracted.context?.trim() ?? "";
        if (curNotes && nextNotes && !curNotes.includes(nextNotes)) {
          // If the model restated the draft with new text tacked on, keep only
          // the new tail; otherwise append.
          const tail = nextNotes.startsWith(curNotes)
            ? nextNotes.slice(curNotes.length).replace(/^[\s.,;—-]+/, "")
            : nextNotes;
          appended = tail ? `${curNotes}\n${tail}` : curNotes;
        }
        return {
          name: pick(extracted.name, cur.name),
          alsoKnows: union(cur.alsoKnows, extracted.also_knows),
          whatTheyDo: appended,
          event: pick(extracted.met_at, cur.event),
          company: pick(extracted.company, cur.company),
          school: pick(extracted.school, cur.school),
          phone: pick(extracted.phone, cur.phone),
          email: pick(extracted.email, cur.email),
          instagram: pick(extracted.instagram, cur.instagram),
          twitter: pick(extracted.twitter, cur.twitter),
        };
      });
      setAlsoKnowsRel((cur) => {
        const next = { ...cur };
        for (const k of extracted.also_knows ?? []) {
          if (k.relationship?.trim()) next[k.name.trim().toLowerCase()] = k.relationship.trim();
        }
        return next;
      });
      if (extracted.role?.trim()) setRole(extracted.role.trim());
      if (extracted.group_name) {
        const match = groups.find(
          (g) => g.name.toLowerCase() === extracted.group_name!.trim().toLowerCase()
        );
        if (match) {
          setGroupId(match.id);
        } else {
          // Spoken group that doesn't exist yet — create it on the spot
          // (createGroup dedupes by name and auto-assigns the next color).
          try {
            const group = await createGroup(extracted.group_name);
            setGroups((cur) => (cur.some((g) => g.id === group.id) ? cur : [...cur, group]));
            setGroupId(group.id);
          } catch {
            // Group creation failing shouldn't sink the extraction.
          }
        }
      }
      if (extracted.follow_up_hours) setFollowUpHours(extracted.follow_up_hours);
      if (extracted.follow_up_about) setFollowUpAbout(extracted.follow_up_about);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
      setStatus("idle");
    }
  }

  async function handleSave() {
    if (!fields.name.trim()) {
      setError("A name is required.");
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      await saveConnection(
        {
          name: fields.name.trim(),
          role: role.trim() || undefined,
          company: fields.company.trim() || undefined,
          met_at: fields.event.trim() || undefined,
          school: fields.school.trim() || undefined,
          context: fields.whatTheyDo.trim() || undefined,
          phone: fields.phone.trim() || undefined,
          email: fields.email.trim() || undefined,
          instagram: fields.instagram.trim().replace(/^@/, "") || undefined,
          twitter: fields.twitter.trim().replace(/^@/, "") || undefined,
          group_id: groupId ?? undefined,
          also_knows: fields.alsoKnows
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean)
            .map((n) => ({ name: n, relationship: alsoKnowsRel[n.toLowerCase()] })),
          follow_up_hours: followUpHours,
          follow_up_about: followUpAbout.trim() || undefined,
        },
        transcriptRef.current
      );
      setFields(EMPTY_FIELDS);
      setRole("");
      setGroupId(null);
      setAlsoKnowsRel({});
      setFollowUpHours(undefined);
      setFollowUpAbout("");
      transcriptRef.current = "";
      setSaved(true);
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setStatus("idle");
    }
  }

  const rows: { key: keyof Fields; label: string; placeholder?: string }[] = [
    { key: "name", label: "Name" },
    { key: "whatTheyDo", label: "What they Do" },
  ];

  const halfInput =
    "mt-1 w-full rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-normal text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300";
  const halfRows: [keyof Fields, string, string][][] = [
    [
      ["alsoKnows", "Also knows…", "names, comma-sep"],
      ["event", "Met because…", "how you met"],
    ],
    [
      ["school", "School", ""],
      ["company", "Company", ""],
    ],
  ];

  const contactRows: { key: keyof Fields; placeholder: string }[] = [
    { key: "phone", placeholder: "phone" },
    { key: "email", placeholder: "email" },
    { key: "instagram", placeholder: "@instagram" },
    { key: "twitter", placeholder: "@twitter / X" },
  ];

  return (
    <div className="flex flex-1 flex-col rounded-3xl bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-50 px-5 py-6">
      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <label key={row.key} className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
            {row.label}
            <input
              value={fields[row.key]}
              onChange={(e) => set(row.key)(e.target.value)}
              placeholder={status === "recording" ? "Listening…" : (row.placeholder ?? "")}
              className="mt-1 w-full rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-normal text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
            />
          </label>
        ))}

        {halfRows.map((pair) => (
          <div key={pair[0][0]} className="grid grid-cols-2 gap-3">
            {pair.map(([key, label, placeholder]) => (
              <label key={key} className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                {label}
                <input
                  value={fields[key]}
                  onChange={(e) => set(key)(e.target.value)}
                  placeholder={status === "recording" ? "Listening…" : placeholder}
                  className={halfInput}
                />
              </label>
            ))}
          </div>
        ))}

        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          Contact
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {contactRows.map((row) => (
              <input
                key={row.key}
                value={fields[row.key]}
                onChange={(e) => set(row.key)(e.target.value)}
                placeholder={row.placeholder}
                className="min-w-0 flex-1 rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-normal text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
              />
            ))}
          </div>
        </div>

        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          Group
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {groups.map((g) => {
              const active = groupId === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGroupId(active ? null : g.id)}
                  className={
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-normal " +
                    (active
                      ? "bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900"
                      : "bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300")
                  }
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: g.color }}
                  />
                  {g.name}
                </button>
              );
            })}
            {addingGroup ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newGroupName.trim()) return;
                  try {
                    const group = await createGroup(newGroupName);
                    setGroups((cur) =>
                      cur.some((g) => g.id === group.id) ? cur : [...cur, group]
                    );
                    setGroupId(group.id);
                    setNewGroupName("");
                    setAddingGroup(false);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to create group");
                  }
                }}
                // Collapse when focus leaves the mini-form (tap-out); keep it
                // open while moving between its own input and Add button.
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setAddingGroup(false);
                    setNewGroupName("");
                  }
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  autoFocus
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="group name"
                  className="w-28 rounded-full border-0 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-normal text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
                />
                <button
                  type="submit"
                  className="rounded-full bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:text-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-50"
                >
                  Add
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddingGroup(true)}
                className="rounded-full bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-normal text-neutral-400 dark:text-neutral-500"
              >
                + New
              </button>
            )}
          </div>
          {(() => {
            const desc = groups.find((g) => g.id === groupId)?.description;
            return desc ? (
              <p className="mt-1.5 text-xs font-normal text-neutral-500 dark:text-neutral-400">{desc}</p>
            ) : null;
          })()}
        </div>

        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          Follow up
          <div className="mt-1.5 flex gap-2">
            {FOLLOW_UP_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setFollowUpHours(opt.hours)}
                className={
                  followUpHours === opt.hours
                    ? "rounded-full bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:text-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-50"
                    : "rounded-full bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-normal text-neutral-600 dark:text-neutral-300"
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          {followUpHours !== undefined && (
            <input
              value={followUpAbout}
              onChange={(e) => setFollowUpAbout(e.target.value)}
              placeholder="What's the follow-up about?"
              className="mt-2 w-full rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-normal text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
            />
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="mt-3 text-sm text-emerald-700">Connection saved.</p>}
      {!supported && (
        <p className="mt-3 text-sm text-red-600">
          Voice needs a browser with the Web Speech API (Chrome works best) — you can still type.
        </p>
      )}

      <div className="mt-auto flex flex-col items-center gap-3 pt-6">
        {status === "recording" && (
          <div className="w-full rounded-2xl bg-white p-4 dark:bg-neutral-800">
            <style>{`@keyframes guyWave { 0%, 100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }`}</style>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
              <span className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                Recording
              </span>
              <span className="ml-1 flex h-4 items-center gap-[3px]">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-red-500"
                    style={{
                      height: "100%",
                      animation: `guyWave 1s ease-in-out ${i * 0.15}s infinite`,
                    }}
                  />
                ))}
              </span>
            </div>
            <p
              className={
                "mt-2 min-h-12 text-sm " +
                (liveTranscript
                  ? "text-neutral-900 dark:text-neutral-50"
                  : "italic text-neutral-400 dark:text-neutral-500")
              }
            >
              {liveTranscript || "say anything! guy will automatically fill out their info."}
            </p>
          </div>
        )}
        {status === "processing" ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Extracting details…</p>
        ) : (
          <button
            type="button"
            onClick={status === "recording" ? stopAndExtract : startRecording}
            aria-label={status === "recording" ? "Stop recording" : "Start recording"}
            className={
              status === "recording"
                ? "h-20 w-20 animate-pulse rounded-full bg-red-600"
                : "h-20 w-20 rounded-full bg-neutral-900 dark:bg-neutral-100"
            }
          />
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={status === "saving" || !fields.name.trim()}
          className="rounded-full bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 px-6 py-2.5 text-sm font-medium text-neutral-50 disabled:opacity-30"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
