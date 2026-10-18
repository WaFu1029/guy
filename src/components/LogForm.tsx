"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveConnection } from "@/app/log/actions";
import { setPersonPhoto } from "@/app/people/actions";
import { PhotoCapture } from "@/components/PhotoCapture";
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

// Every new contact starts warm; a spoken or tapped rating overrides it, and
// tapping the active rating still clears it to unrated.
const DEFAULT_LEAD_HEAT = 3;

type Fields = {
  name: string;
  role: string;
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
  role: "",
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
// Wraps a field so it can glow when extraction fills it: a sunset-gradient
// ring and soft halo behind the input that sweeps and fades. Keyed on the
// nonce so each bump remounts the halo (replaying the animation) without
// touching the input itself — focus and caret stay put.
function Glow({
  nonce,
  className,
  children,
}: {
  nonce: number | undefined;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={"relative isolate flex flex-col " + (className ?? "")}>
      {nonce ? <span key={nonce} aria-hidden className="guy-glow" /> : null}
      {children}
    </div>
  );
}

export function LogForm({
  groups: initialGroups,
  peopleContext = [],
  networkPeople = [],
  vocabulary = [],
}: {
  groups: Group[];
  // One summary line per existing contact (name — role · company — notes…).
  peopleContext?: string[];
  // Existing contacts, for the name autocomplete on the person fields.
  networkPeople?: SuggestPerson[];
  // The user's spoken-word canon — spellings the extractor snaps near-misses
  // onto, for names the transcriber reliably mangles.
  vocabulary?: string[];
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
  // Per-field counter, bumped whenever extraction fills that field; each bump
  // replays the glow.
  const [flash, setFlash] = useState<Partial<Record<keyof Fields, number>>>({});
  const [leadHeat, setLeadHeat] = useState<number | undefined>(DEFAULT_LEAD_HEAT);
  const [followUpHours, setFollowUpHours] = useState<number | undefined>(undefined);
  const [followUpAbout, setFollowUpAbout] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Photo taken during capture; uploaded once the person exists.
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [capturingPhoto, setCapturingPhoto] = useState(false);
  const takePhoto = (blob: Blob) => {
    setCapturingPhoto(false);
    setPhoto((cur) => {
      if (cur) URL.revokeObjectURL(cur.url);
      return { blob, url: URL.createObjectURL(blob) };
    });
  };
  const clearPhoto = () =>
    setPhoto((cur) => {
      if (cur) URL.revokeObjectURL(cur.url);
      return null;
    });
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
  const statusRef = useRef<Status>(status);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);
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
    if (cur.role.trim()) draft.role = cur.role.trim();
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
        vocabulary,
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
    const merge = (cur: Fields): Fields => {
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
        role: pick("role", extracted.role),
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
    };
    // Glow every field this pass filled or changed, so the user sees what
    // was just heard land.
    const before = fieldsRef.current;
    const after = merge(before);
    const changed = (Object.keys(after) as (keyof Fields)[]).filter(
      (k) => after[k] !== before[k] && after[k].trim()
    );
    setFields(merge);
    if (changed.length > 0) {
      setFlash((f) => {
        const next = { ...f };
        for (const k of changed) next[k] = (next[k] ?? 0) + 1;
        return next;
      });
    }
    setAlsoKnowsRel((cur) => {
      const next = { ...cur };
      for (const k of extracted.also_knows ?? []) {
        if (k.relationship?.trim()) next[k.name.trim().toLowerCase()] = k.relationship.trim();
      }
      return next;
    });
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

  // Live fill: interim extractions run back-to-back while the user talks,
  // each on everything heard so far (including words still being
  // recognized), so the form keeps up with speech instead of waiting for a
  // pause. One pass in flight at a time; when it lands, the next starts on
  // whatever was said meanwhile. A short idle timer flushes a small tail.
  const LIVE_MIN_NEW_CHARS = 10;
  const LIVE_IDLE_MS = 500;
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);
  const liveBusyRef = useRef(false);
  // On from startRecording until stop — statusRef lags a render behind, so
  // it can't fence off a pass that lands after stop.
  const liveOnRef = useRef(false);
  // Finals + interim words: fresher than transcriptRef, which only holds
  // settled phrases for the authoritative final pass.
  const liveTextRef = useRef("");
  const liveSentRef = useRef("");
  const [liveFilling, setLiveFilling] = useState(false);

  const runLiveExtract = async () => {
    if (!liveOnRef.current || liveBusyRef.current) return;
    const transcript = liveTextRef.current;
    if (!transcript || transcript === liveSentRef.current) return;
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
      if (liveOnRef.current) await applyExtracted(extracted, { live: true });
    } catch {
      // Interim passes fail silently — the final pass on stop is authoritative.
    } finally {
      if (liveAbortRef.current === controller) {
        liveBusyRef.current = false;
        liveAbortRef.current = null;
        setLiveFilling(false);
        kickLiveExtract();
      }
    }
  };

  const kickLiveExtract = () => {
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    liveTimerRef.current = null;
    if (!liveOnRef.current || liveBusyRef.current) return;
    const text = liveTextRef.current;
    if (text === liveSentRef.current) return;
    if (text.length - liveSentRef.current.length >= LIVE_MIN_NEW_CHARS) runLiveExtract();
    else liveTimerRef.current = setTimeout(runLiveExtract, LIVE_IDLE_MS);
  };

  const cancelLiveExtract = () => {
    liveOnRef.current = false;
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
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalTranscript += result[0].transcript + " ";
        else interim += result[0].transcript;
      }
      transcriptRef.current = finalTranscript.trim();
      liveTextRef.current = (finalTranscript + interim).trim();
      setLiveTranscript(liveTextRef.current);
      kickLiveExtract();
    };
    recognition.onerror = (event) => {
      cancelLiveExtract();
      setError(`Speech recognition error: ${event.error}`);
      setStatus("idle");
    };

    transcriptRef.current = "";
    liveSentRef.current = "";
    liveTextRef.current = "";
    liveOnRef.current = true;
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

  function resetForm() {
    clearPhoto();
    setFields(EMPTY_FIELDS);
    setGroupId(null);
    setLeadHeat(DEFAULT_LEAD_HEAT);
    setAlsoKnowsRel({});
    setFollowUpHours(undefined);
    setFollowUpAbout("");
    transcriptRef.current = "";
  }

  // Throw away the draft: stop the mic without a final pass, drop any live
  // pass in flight, and clear the form and transcript.
  function handleCancel() {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.abort();
      recognitionRef.current = null;
    }
    cancelLiveExtract();
    resetForm();
    setLiveTranscript("");
    setError(null);
    setSaved(false);
    setStatus("idle");
  }

  const hasDraft =
    status === "recording" ||
    Object.values(fields).some((v) => v.trim()) ||
    !!liveTranscript ||
    groupId !== null ||
    leadHeat !== DEFAULT_LEAD_HEAT ||
    followUpHours !== undefined ||
    !!followUpAbout.trim() ||
    photo !== null;

  async function handleSave() {
    // Only from idle: a save while the final pass is still extracting lands
    // without what that pass adds (a spoken group, a follow-up), and the pass
    // then writes those onto the freshly cleared form instead.
    if (status !== "idle") return;
    if (!fields.name.trim()) {
      setError("A name is required.");
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      const personId = await saveConnection(
        {
          name: fields.name.trim(),
          role: fields.role.trim() || undefined,
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
      // The person is saved either way; a failed photo upload just says so.
      let photoFailed = false;
      if (photo) {
        try {
          const form = new FormData();
          form.append("photo", photo.blob, "photo.jpg");
          await setPersonPhoto(personId, form);
        } catch {
          photoFailed = true;
        }
      }
      resetForm();
      if (photoFailed) setError("Saved — but the photo didn't upload. Add it from their page.");
      setSaved(true);
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setStatus("idle");
    }
  }

  // Option+R toggles the recording, Option+S saves. Held in a ref so the
  // listener below always calls the current closures without rebinding.
  const shortcutsRef = useRef<{ toggleRecording: () => void; save: () => void }>(null!);
  // Written in an effect rather than during render: a ref mutated mid-render
  // can be torn by a render React throws away. No dependency array, so every
  // render refreshes the closures the listener calls.
  useEffect(() => {
    shortcutsRef.current = {
      toggleRecording: () => {
        if (status === "recording") stopAndExtract();
        else if (status === "idle") startRecording();
      },
      save: () => {
        if (status === "idle" && fields.name.trim()) handleSave();
      },
    };
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      // Matched on e.code because Option+letter on macOS reports key as the
      // accented character ("®", "ß"), not the letter.
      if (e.code !== "KeyR" && e.code !== "KeyS") return;
      // Stops the browser inserting that character when a field has focus.
      e.preventDefault();
      if (e.code === "KeyR") shortcutsRef.current.toggleRecording();
      else shortcutsRef.current.save();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
    // Rendered two-up in a shared row.
    pair?: boolean;
  }[] = [
    { key: "name", label: "Name", placeholder: "who did you meet?", suggest: "single" },
    { key: "role", label: "Role", placeholder: "their title or position" },
    {
      key: "whatTheyDo",
      label: "What they Do",
      placeholder: "what they work on, what they're looking for, anything worth remembering",
      multiline: true,
      lines: 3,
    },
    {
      key: "howTheyHelp",
      label: "How they can help",
      placeholder: "the role you see them playing — intro, hire, customer, advice…",
      multiline: true,
      lines: 3,
    },
    { key: "alsoKnows", label: "Also knows…", placeholder: "names, comma-sep", suggest: "csv", pair: true },
    { key: "event", label: "Met because…", placeholder: "how you met", pair: true },
  ];

  const renderRow = (row: (typeof rows)[number]) => (
    <label key={row.key} className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
      {row.label}
      <Glow nonce={flash[row.key]} className="mt-1">
        {row.suggest ? (
          <PersonSuggestInput
            value={fields[row.key]}
            onChange={set(row.key)}
            people={networkPeople}
            mode={row.suggest}
            placeholder={status === "recording" ? "Listening…" : (row.placeholder ?? "")}
            className="w-full rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-normal text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
          />
        ) : row.multiline ? (
          <textarea
            rows={row.lines ?? 4}
            value={fields[row.key]}
            onChange={(e) => set(row.key)(e.target.value)}
            placeholder={status === "recording" ? "Listening…" : (row.placeholder ?? "")}
            className="w-full resize-y rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-normal text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
          />
        ) : (
          <input
            value={fields[row.key]}
            onChange={(e) => set(row.key)(e.target.value)}
            placeholder={status === "recording" ? "Listening…" : (row.placeholder ?? "")}
            className="w-full rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-normal text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
          />
        )}
      </Glow>
    </label>
  );

  const halfInput =
    "w-full rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-normal text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300";
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
        {rows.filter((r) => !r.pair).map(renderRow)}
        <div className="grid grid-cols-2 gap-3">
          {rows.filter((r) => r.pair).map(renderRow)}
        </div>

        {halfRows.map((pair) => (
          <div key={pair[0][0]} className="grid grid-cols-2 gap-3">
            {pair.map(([key, label, placeholder]) => (
              <label key={key} className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                {label}
                <Glow nonce={flash[key]} className="mt-1">
                  <input
                    value={fields[key]}
                    onChange={(e) => set(key)(e.target.value)}
                    placeholder={status === "recording" ? "Listening…" : placeholder}
                    className={halfInput}
                  />
                </Glow>
              </label>
            ))}
          </div>
        ))}

        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          Contact
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {contactRows.map((row) => (
              <Glow key={row.key} nonce={flash[row.key]} className="min-w-0">
              <input
                value={fields[row.key]}
                onChange={(e) => set(row.key)(e.target.value)}
                placeholder={row.placeholder}
                className="w-full min-w-0 rounded-xl border-0 bg-white dark:bg-neutral-800 px-3 py-2 text-sm font-normal text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
              />
              </Glow>
            ))}
          </div>
        </div>
      </div>

      {/* Right column on desktop: the taxonomy choices (group, follow-up)
          plus the voice controls. Stacks under the fields on phones. */}
      <div className="mt-4 flex flex-col gap-4 lg:mt-0 lg:w-[380px] lg:shrink-0 xl:w-[420px]">
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          Photo
          <div className="mt-1.5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCapturingPhoto(true)}
              aria-label={photo ? "Retake photo" : "Take photo"}
              className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                <img src={photo.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" strokeLinejoin="round" />
                  <circle cx="12" cy="12.5" r="3.5" />
                </svg>
              )}
            </button>
            <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">
              {photo ? (
                <>
                  Shows on their page.{" "}
                  <button type="button" onClick={clearPhoto} className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-50">
                    Remove
                  </button>
                </>
              ) : (
                "Snap them so you remember the face."
              )}
            </span>
          </div>
          {capturingPhoto && (
            <PhotoCapture onCapture={takePhoto} onClose={() => setCapturingPhoto(false)} />
          )}
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
                  onClick={() => {
                    chose("group");
                    setGroupId(active ? null : g.id);
                  }}
                  className={
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-normal " +
                    (active
                      ? "bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-300"
                      : "bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700")
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
                  className="rounded-full bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:text-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-50 hover:bg-neutral-700 dark:hover:bg-neutral-300"
                >
                  Add
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAddingGroup(true)}
                className="rounded-full bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-normal text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700"
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
                      ? "bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-300"
                      : "bg-white text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700")
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
                    ? "rounded-full bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:text-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-50 hover:bg-neutral-700 dark:hover:bg-neutral-300"
                    : "rounded-full bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-normal text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
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
        {/* Stays up after recording stops and after saving, so the user can
            check what was heard; cleared when the next recording starts. */}
        {status !== "recording" && liveTranscript && (
          <div className="w-full rounded-2xl bg-white p-4 dark:bg-neutral-800">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Transcript
            </span>
            <p className="mt-2 text-sm text-neutral-900 dark:text-neutral-50">{liveTranscript}</p>
          </div>
        )}
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
            aria-label={
              (status === "recording" ? "Stop recording" : "Start recording") + " (Option+R)"
            }
            aria-keyshortcuts="Alt+R"
            className={
              status === "recording"
                ? "h-20 w-20 animate-pulse rounded-full bg-red-600 hover:scale-105 hover:bg-red-700"
                : "h-20 w-20 rounded-full bg-neutral-900 dark:bg-neutral-100 hover:scale-105 hover:bg-neutral-700 dark:hover:bg-neutral-300"
            }
          />
        )}
        {/* Hidden on touch-sized screens, where there's no key to press. */}
        {status !== "processing" && (
          <p
            aria-hidden
            className="hidden text-xs text-neutral-400 dark:text-neutral-500 sm:block"
          >
            <kbd className="font-sans font-medium">⌥R</kbd>{" "}
            {status === "recording" ? "to stop" : "to record"}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={status !== "idle" || !fields.name.trim()}
            aria-keyshortcuts="Alt+S"
            className="rounded-full bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 px-6 py-2.5 text-sm font-medium text-neutral-50 enabled:hover:bg-neutral-700 dark:enabled:hover:bg-neutral-300 disabled:opacity-30"
          >
            {status === "saving" ? "Saving…" : "Save"}
            <span aria-hidden className="ml-2 hidden text-xs opacity-50 sm:inline">
              ⌥S
            </span>
          </button>
          {hasDraft && status !== "processing" && status !== "saving" && (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-full px-5 py-2.5 text-sm font-medium text-neutral-600 ring-1 ring-neutral-300 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-300 dark:ring-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
