"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveConnection } from "@/app/log/actions";
import { createGroup } from "@/app/groups/actions";
import type { ExtractedConnection } from "@/types/extraction";
import { PersonSuggestInput, type SuggestPerson } from "@/components/PersonSuggestInput";
import type { Group } from "@/types/database";

type Status = "idle" | "recording" | "processing" | "saving";

// Lead heat, 1 (cold) … 5 (hot) — a quick gut rating at capture time.
const LEAD_HEAT_OPTIONS = [1, 2, 3, 4, 5] as const;

const FOLLOW_UP_OPTIONS = [
  { label: "None", hours: undefined },
  { label: "Tonight", hours: 8 },
  { label: "1 day", hours: 24 },
  { label: "2 days", hours: 48 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
  { label: "2 weeks", hours: 336 },
  { label: "1 month", hours: 720 },
  { label: "3 months", hours: 2160 },
];

// Snap an arbitrary hour count onto the closest chip so the choice is always
// visible in the form.
function nearestFollowUp(hours: number): number {
  const offered = FOLLOW_UP_OPTIONS.map((o) => o.hours).filter((h): h is number => h !== undefined);
  return offered.reduce((best, h) => (Math.abs(h - hours) < Math.abs(best - hours) ? h : best));
}

type Fields = {
  name: string;
  alsoKnows: string;
  whatTheyDo: string;
  howTheyHelp: string;
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
  howTheyHelp: "",
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
  networkPeople = [],
}: {
  groups: Group[];
  // One summary line per existing contact (name — role · company — notes…).
  peopleContext?: string[];
  // Existing contacts, for the name autocomplete on the person fields.
  networkPeople?: SuggestPerson[];
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
  const [leadHeat, setLeadHeat] = useState<number | undefined>(undefined);
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

  // Fields the user edited by hand mid-recording. Live extraction leaves those
  // alone, so a typed correction can't be overwritten by a later interim pass.
  const manualEditsRef = useRef<Set<keyof Fields>>(new Set());
  // Notes as they stood when the current recording started. Every extraction
  // pass rebuilds the field from this snapshot rather than appending to its
  // own previous output — otherwise each interim pass restates the growing
  // draft in slightly different words, the duplicate check misses, and the
  // field fills up with near-copies of the same sentences.
  const baseNotesRef = useRef("");
  // Same idea for the chip choices, which aren't text fields.
  const manualChoicesRef = useRef<Set<"group" | "leadHeat" | "followUp">>(new Set());
  const chose = (choice: "group" | "leadHeat" | "followUp") => {
    if (statusRef.current === "recording") manualChoicesRef.current.add(choice);
  };
  // Latest values for the live-extraction loop, which runs outside of render.
  const fieldsRef = useRef(fields);
  const roleRef = useRef(role);
  const statusRef = useRef<Status>(status);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);
  useEffect(() => {
    roleRef.current = role;
  }, [role]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const set = (key: keyof Fields) => (value: string) => {
    if (statusRef.current === "recording") manualEditsRef.current.add(key);
    setFields((f) => ({ ...f, [key]: value }));
  };

  // Send the current draft + the user's groups and contacts so a follow-on
  // pass merges (pronouns resolve, "put him under builders" works, mentioned
  // names match existing people).
  function buildDraft(): Record<string, string> {
    const cur = fieldsRef.current;
    const draft: Record<string, string> = {};
    if (cur.name.trim()) draft.name = cur.name.trim();
    if (roleRef.current.trim()) draft.role = roleRef.current.trim();
    if (cur.company.trim()) draft.company = cur.company.trim();
    if (cur.school.trim()) draft.school = cur.school.trim();
    // While a recording is in flight the live value is this session's own
    // extraction — showing it back to the model invites a restatement.
    const inSession =
      statusRef.current === "recording" || statusRef.current === "processing";
    const notesForDraft = inSession ? baseNotesRef.current : cur.whatTheyDo;
    if (notesForDraft.trim()) draft.notes = notesForDraft.trim();
    if (cur.howTheyHelp.trim()) draft.how_they_help = cur.howTheyHelp.trim();
    if (cur.event.trim()) draft.met_because = cur.event.trim();
    return draft;
  }

  async function requestExtraction(
    transcript: string,
    opts: { interim: boolean; signal?: AbortSignal }
  ): Promise<ExtractedConnection> {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: opts.signal,
      body: JSON.stringify({
        transcript,
        draft: buildDraft(),
        groups: groups.map((g) => g.name),
        people: peopleContext,
        interim: opts.interim,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Extraction failed");
    }
    const { extracted } = (await res.json()) as { extracted: ExtractedConnection };
    return extracted;
  }

  // Merge into the draft instead of replacing it: a non-empty extracted value
  // wins (spoken corrections apply), an omitted one keeps what's there, notes
  // append, and "also knows" unions.
  async function applyExtracted(extracted: ExtractedConnection, opts: { live: boolean }) {
    setFields((cur) => {
      const keep = (key: keyof Fields) => opts.live && manualEditsRef.current.has(key);
      const pick = (key: keyof Fields, next: string | undefined) =>
        keep(key) ? cur[key] : next?.trim() || cur[key];
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
      // Notes = whatever was there before this recording + what this
      // recording has said so far. Recomputed from the snapshot on every
      // pass, so passes replace each other instead of stacking up.
      const base = baseNotesRef.current.trim();
      const nextNotes = extracted.context?.trim() ?? "";
      let appended: string;
      if (keep("whatTheyDo") || !nextNotes) appended = cur.whatTheyDo;
      else if (!base) appended = nextNotes;
      else if (nextNotes.includes(base)) appended = nextNotes;
      else appended = `${base}\n${nextNotes}`;
      return {
        name: pick("name", extracted.name),
        alsoKnows: keep("alsoKnows")
          ? cur.alsoKnows
          : union(cur.alsoKnows, extracted.also_knows),
        whatTheyDo: appended,
        howTheyHelp: pick("howTheyHelp", extracted.how_they_help),
        event: pick("event", extracted.met_at),
        company: pick("company", extracted.company),
        school: pick("school", extracted.school),
        phone: pick("phone", extracted.phone),
        email: pick("email", extracted.email),
        instagram: pick("instagram", extracted.instagram),
        twitter: pick("twitter", extracted.twitter),
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
    const held = (choice: "group" | "leadHeat" | "followUp") =>
      opts.live && manualChoicesRef.current.has(choice);
    if (extracted.group_name && !held("group")) {
      const match = groups.find(
        (g) => g.name.toLowerCase() === extracted.group_name!.trim().toLowerCase()
      );
      if (match) {
        setGroupId(match.id);
      } else if (!opts.live) {
        // Spoken group that doesn't exist yet — create it on the spot
        // (createGroup dedupes by name and auto-assigns the next color).
        // Never during a live pass: a half-heard sentence shouldn't leave a
        // stray group behind.
        try {
          const group = await createGroup(extracted.group_name);
          setGroups((cur) => (cur.some((g) => g.id === group.id) ? cur : [...cur, group]));
          setGroupId(group.id);
        } catch {
          // Group creation failing shouldn't sink the extraction.
        }
      }
    }
    if (typeof extracted.lead_heat === "number" && !held("leadHeat")) {
      const heat = Math.round(extracted.lead_heat);
      if (heat >= 1 && heat <= 5) setLeadHeat(heat);
    }
    // The model is told to snap to the offered options, but a stray value
    // ("in about 5 days") would leave no chip selected — snap it here too.
    if (extracted.follow_up_hours && !held("followUp")) {
      setFollowUpHours(nearestFollowUp(extracted.follow_up_hours));
    }
    if (extracted.follow_up_about && !held("followUp")) {
      setFollowUpAbout(extracted.follow_up_about);
    }
  }

  // Live fill: every pause in speech kicks off an interim extraction against
  // the transcript so far, so the form populates while the user is still
  // talking instead of only on stop.
  const LIVE_DEBOUNCE_MS = 1100;
  const LIVE_MIN_NEW_CHARS = 12;
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);
  const liveBusyRef = useRef(false);
  const liveSentRef = useRef("");
  const [liveFilling, setLiveFilling] = useState(false);

  const runLiveExtract = async () => {
    if (statusRef.current !== "recording") return;
    const transcript = transcriptRef.current;
    if (transcript.length - liveSentRef.current.length < LIVE_MIN_NEW_CHARS) return;
    // One interim pass at a time; whatever was said meanwhile goes in the next.
    if (liveBusyRef.current) {
      scheduleLiveExtract();
      return;
    }
    liveBusyRef.current = true;
    liveSentRef.current = transcript;
    setLiveFilling(true);
    const controller = new AbortController();
    liveAbortRef.current = controller;
    try {
      const extracted = await requestExtraction(transcript, {
        interim: true,
        signal: controller.signal,
      });
      if (statusRef.current === "recording") await applyExtracted(extracted, { live: true });
    } catch {
      // Interim passes fail silently — the final pass on stop is authoritative.
    } finally {
      liveBusyRef.current = false;
      liveAbortRef.current = null;
      setLiveFilling(false);
    }
  };

  const scheduleLiveExtract = () => {
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    liveTimerRef.current = setTimeout(runLiveExtract, LIVE_DEBOUNCE_MS);
  };

  const cancelLiveExtract = () => {
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    liveTimerRef.current = null;
    liveAbortRef.current?.abort();
    liveAbortRef.current = null;
    liveBusyRef.current = false;
    setLiveFilling(false);
  };

  useEffect(() => cancelLiveExtract, []);

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
      let settled = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + " ";
          settled = true;
        } else interim += result[0].transcript;
      }
      transcriptRef.current = finalTranscript.trim();
      setLiveTranscript((finalTranscript + interim).trim());
      // Only a settled phrase is worth extracting; interim words churn.
      if (settled) scheduleLiveExtract();
    };
    recognition.onerror = (event) => {
      setError(`Speech recognition error: ${event.error}`);
      setStatus("idle");
    };

    transcriptRef.current = "";
    liveSentRef.current = "";
    baseNotesRef.current = fieldsRef.current.whatTheyDo;
    manualEditsRef.current = new Set();
    manualChoicesRef.current = new Set();
    setLiveTranscript("");
    recognitionRef.current = recognition;
    recognition.start();
    setStatus("recording");
  }

  async function stopAndExtract() {
    recognitionRef.current?.stop();
    cancelLiveExtract();
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
      const extracted = await requestExtraction(transcript, { interim: false });
      await applyExtracted(extracted, { live: false });
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
          how_they_help: fields.howTheyHelp.trim() || undefined,
          phone: fields.phone.trim() || undefined,
          email: fields.email.trim() || undefined,
          instagram: fields.instagram.trim().replace(/^@/, "") || undefined,
          twitter: fields.twitter.trim().replace(/^@/, "") || undefined,
          group_id: groupId ?? undefined,
          lead_heat: leadHeat,
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
      setLeadHeat(undefined);
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

  // Full-width rows. "What they Do" is a textarea — it usually holds a few
  // sentences of spoken context, so it opens at four lines instead of one.
  const rows: {
    key: keyof Fields;
    label: string;
    placeholder?: string;
    multiline?: boolean;
    // Textarea height; defaults to four lines.
    lines?: number;
    // Autocomplete against the existing network: "single" completes the whole
    // field, "csv" completes only the name after the last comma.
    suggest?: "single" | "csv";
  }[] = [
    { key: "name", label: "Name", placeholder: "who did you meet?", suggest: "single" },
    {
      key: "whatTheyDo",
      label: "What they Do",
      placeholder: "what they work on, what they're looking for, anything worth remembering",
      multiline: true,
    },
    {
      key: "howTheyHelp",
      label: "How they can help",
      placeholder: "the role you see them playing — intro, hire, customer, advice…",
      multiline: true,
      lines: 3,
    },
    { key: "alsoKnows", label: "Also knows…", placeholder: "names, comma-sep", suggest: "csv" },
    { key: "event", label: "Met because…", placeholder: "how you met" },
  ];

  const halfInput =
    "mt-1 w-full rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-normal text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300";
  const halfRows: [keyof Fields, string, string][][] = [
    [
      ["school", "School", "where they studied"],
      ["company", "Company", "where they work"],
    ],
  ];

  const contactRows: { key: keyof Fields; placeholder: string }[] = [
    { key: "phone", placeholder: "phone" },
    { key: "email", placeholder: "email" },
    { key: "instagram", placeholder: "@instagram" },
    { key: "twitter", placeholder: "@twitter / X" },
  ];

  return (
    // Phone: one column, record circle pinned to the bottom. Desktop: two
    // columns — the person's details on the left, the group / follow-up
    // choices and the voice controls on the right.
    <div className="flex flex-1 flex-col rounded-3xl bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-50 px-5 py-6 lg:flex-row lg:items-stretch lg:gap-8 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 lg:min-w-0 lg:flex-1">
        {rows.map((row) => (
          <label key={row.key} className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
            {row.label}
            {row.suggest ? (
              <PersonSuggestInput
                value={fields[row.key]}
                onChange={set(row.key)}
                people={networkPeople}
                mode={row.suggest}
                placeholder={status === "recording" ? "Listening…" : (row.placeholder ?? "")}
                className="mt-1 w-full rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-normal text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
              />
            ) : row.multiline ? (
              <textarea
                rows={row.lines ?? 4}
                value={fields[row.key]}
                onChange={(e) => set(row.key)(e.target.value)}
                placeholder={status === "recording" ? "Listening…" : (row.placeholder ?? "")}
                className="mt-1 w-full resize-y rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-normal text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
              />
            ) : (
              <input
                value={fields[row.key]}
                onChange={(e) => set(row.key)(e.target.value)}
                placeholder={status === "recording" ? "Listening…" : (row.placeholder ?? "")}
                className="mt-1 w-full rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-normal text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
              />
            )}
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
      </div>

      {/* Right column on desktop: the taxonomy choices (group, follow-up)
          plus the voice controls. Stacks under the fields on phones. */}
      <div className="mt-4 flex flex-col gap-4 lg:mt-0 lg:w-[380px] lg:shrink-0 xl:w-[420px]">
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          Group
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {groups.map((g) => {
              const active = groupId === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    chose("group");
                    setGroupId(active ? null : g.id);
                  }}
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
          Lead heat
          <div className="mt-1.5 flex items-center gap-2">
            {LEAD_HEAT_OPTIONS.map((n) => {
              const active = leadHeat !== undefined && n <= leadHeat;
              return (
                <button
                  key={n}
                  type="button"
                  // Tapping the current rating clears it — heat stays optional.
                  onClick={() => {
                    chose("leadHeat");
                    setLeadHeat(leadHeat === n ? undefined : n);
                  }}
                  aria-pressed={leadHeat === n}
                  aria-label={`Lead heat ${n} of 5`}
                  className={
                    "h-9 w-9 rounded-full text-xs font-medium " +
                    (active
                      ? "bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900"
                      : "bg-white text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500")
                  }
                >
                  {n}
                </button>
              );
            })}
            <span className="ml-1 text-xs font-normal text-neutral-500 dark:text-neutral-400">
              {leadHeat === undefined ? "unrated" : leadHeat >= 4 ? "hot" : leadHeat >= 3 ? "warm" : "cold"}
            </span>
          </div>
        </div>

        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          Follow up
          <div className="mt-1.5 flex flex-wrap gap-2">
            {FOLLOW_UP_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  chose("followUp");
                  setFollowUpHours(opt.hours);
                }}
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
            <textarea
              rows={3}
              value={followUpAbout}
              onChange={(e) => {
                chose("followUp");
                setFollowUpAbout(e.target.value);
              }}
              placeholder="What's the follow-up about?"
              className="mt-2 w-full resize-y rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-normal text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
            />
          )}
        </div>
      {error && <p className="mt-3 text-sm text-red-600 lg:mt-0">{error}</p>}
      {saved && !error && <p className="mt-3 text-sm text-emerald-700 lg:mt-0">Connection saved.</p>}
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
              {liveFilling && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  filling in…
                </span>
              )}
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
    </div>
  );
}
