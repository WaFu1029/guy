"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createGroup } from "@/app/groups/actions";
import type { PersonUpdate } from "@/types/extraction";
import type { FollowUp, Person } from "@/types/database";

// Direct inline edit of a person's fields from the profile page. Empty strings
// clear the column; handles strip a leading @. RLS scopes the update.
export async function updatePersonFields(
  personId: string,
  fields: {
    name?: string;
    role?: string;
    how_they_help?: string;
    company?: string;
    school?: string;
    met_at?: string;
    phone?: string;
    email?: string;
    instagram?: string;
    twitter?: string;
    notes?: string;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const patch: Partial<Person> = {};
  // Name is the one column that can't be cleared — every other field treats an
  // empty string as "unset", but a person with no name can't be rendered or
  // found, and the column is NOT NULL.
  if (fields.name !== undefined) {
    const name = fields.name.trim();
    if (!name) throw new Error("A name is required");
    patch.name = name;
  }
  for (const key of [
    "role",
    "how_they_help",
    "company",
    "school",
    "met_at",
    "phone",
    "email",
    "notes",
  ] as const) {
    if (fields[key] !== undefined) patch[key] = fields[key]!.trim() || null;
  }
  for (const key of ["instagram", "twitter"] as const) {
    if (fields[key] !== undefined) {
      patch[key] = fields[key]!.trim().replace(/^@/, "") || null;
    }
  }
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("people").update(patch).eq("id", personId);
  if (error) throw new Error(error.message);
}

// Lead heat, 1 (cold) … 5 (hot); null clears the rating. RLS scopes the
// update, and the check constraint rejects anything outside 1–5 — validated
// here too so a bad value never reaches the database.
export async function updateLeadHeat(personId: string, heat: number | null) {
  if (heat !== null && (!Number.isInteger(heat) || heat < 1 || heat > 5)) {
    throw new Error("Lead heat must be 1–5");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase
    .from("people")
    .update({ lead_heat: heat })
    .eq("id", personId);
  if (error) throw new Error(error.message);
}

// Move a person into a group, or out of every group when groupId is null.
// The column is nullable and ON DELETE SET NULL, so "no group" is a real state
// rather than an error.
export async function updatePersonGroup(personId: string, groupId: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase
    .from("people")
    .update({ group_id: groupId })
    .eq("id", personId);
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath(`/people/${personId}`);
}

// Apply a voice-command patch to a person: field updates, note append/replace,
// and optionally a new follow-up. Returns a short human summary of what changed.
export async function applyPersonUpdate(personId: string, update: PersonUpdate): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: person, error: personError } = await supabase
    .from("people")
    .select("*")
    .eq("id", personId)
    .single();
  if (personError || !person) throw new Error("Person not found");

  const changed: string[] = [];
  const patch: Partial<Person> = {};

  if (update.note) {
    const existing: string = person.notes ?? "";
    // Duplicate guards: skip a note that's already recorded verbatim, and if
    // the model restated the existing notes with new text tacked on, keep only
    // the new tail.
    let note = update.note.trim();
    if (update.note_mode !== "replace" && existing) {
      if (existing.includes(note)) {
        note = "";
      } else if (note.startsWith(existing.trim())) {
        note = note.slice(existing.trim().length).replace(/^[\s.,;—-]+/, "");
      }
    }
    if (note || update.note_mode === "replace") {
      patch.notes =
        update.note_mode === "replace" || !existing ? update.note.trim() : `${existing}\n${note}`;
      changed.push(update.note_mode === "replace" ? "Notes replaced" : "Note added");
    }
  }
  for (const key of [
    "name",
    "role",
    "company",
    "school",
    "met_at",
    "how_they_help",
    "phone",
    "email",
  ] as const) {
    const value = update[key]?.trim();
    if (value) {
      patch[key] = value;
      changed.push(`${key.replaceAll("_", " ")} updated`);
    }
  }
  if (
    typeof update.lead_heat === "number" &&
    Number.isInteger(update.lead_heat) &&
    update.lead_heat >= 1 &&
    update.lead_heat <= 5
  ) {
    patch.lead_heat = update.lead_heat;
    changed.push("lead heat updated");
  }
  if (update.instagram?.trim()) {
    patch.instagram = update.instagram.trim().replace(/^@/, "");
    changed.push("instagram updated");
  }
  if (update.twitter?.trim()) {
    patch.twitter = update.twitter.trim().replace(/^@/, "");
    changed.push("twitter updated");
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("people").update(patch).eq("id", personId);
    if (error) throw new Error(error.message);
  }

  if (update.group_name?.trim()) {
    // createGroup reuses an existing group with the same name (case-insensitive)
    // or creates one with the next palette color.
    const group = await createGroup(update.group_name);
    const { error } = await supabase
      .from("people")
      .update({ group_id: group.id })
      .eq("id", personId);
    if (error) throw new Error(error.message);
    changed.push(`Moved to ${group.name}`);
  }

  // Mentioned acquaintances become person↔person edges; unknown names get a
  // stub person row so the network shows them (same behavior as the log flow).
  for (const known of update.also_knows ?? []) {
    const name = known.name.trim();
    if (!name || name.toLowerCase() === person.name.trim().toLowerCase()) continue;

    const { data: existing } = await supabase
      .from("people")
      .select("id")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();

    let otherId = existing?.id as string | undefined;
    let isNew = false;
    if (!otherId) {
      const { data: stub, error: stubError } = await supabase
        .from("people")
        .insert({ user_id: user.id, name })
        .select()
        .single();
      if (stubError || !stub) continue;
      otherId = stub.id as string;
      isNew = true;
    }

    const { count } = await supabase
      .from("connections")
      .select("*", { count: "exact", head: true })
      .eq("from_person_id", personId)
      .eq("to_person_id", otherId);
    if (!count) {
      await supabase.from("connections").insert({
        user_id: user.id,
        from_person_id: personId,
        to_person_id: otherId,
        relationship_type: "other",
        label: known.relationship?.trim() || null,
      });
    }
    changed.push(isNew ? `Linked ${name} (new contact)` : `Linked ${name}`);
  }

  for (const e of update.follow_up_edits ?? []) {
    const patch: Partial<Pick<FollowUp, "due_at" | "notes" | "status">> = {};
    if (e.due_at) {
      const due = new Date(e.due_at);
      if (!Number.isNaN(due.getTime())) {
        patch.due_at = due.toISOString();
        patch.status = "pending";
      }
    }
    if (e.notes?.trim()) patch.notes = e.notes.trim();
    if (e.action === "complete") patch.status = "completed";
    if (e.action === "dismiss") patch.status = "dismissed";
    if (Object.keys(patch).length === 0) continue;
    // person_id guard: the edit must belong to the profile it was spoken on.
    const { error } = await supabase
      .from("follow_ups")
      .update(patch)
      .eq("id", e.id)
      .eq("person_id", personId);
    if (error) continue;
    changed.push(
      e.action === "complete"
        ? "Follow-up marked done"
        : e.action === "dismiss"
          ? "Follow-up cancelled"
          : patch.due_at
            ? "Follow-up rescheduled"
            : "Follow-up updated"
    );
  }

  if (update.follow_up_hours) {
    const dueAt = new Date(Date.now() + update.follow_up_hours * 60 * 60 * 1000);
    const { error } = await supabase.from("follow_ups").insert({
      user_id: user.id,
      person_id: personId,
      due_at: dueAt.toISOString(),
      notes: update.follow_up_about ?? null,
    });
    if (error) throw new Error(error.message);
    changed.push(`Follow-up in ${update.follow_up_hours}h`);
  }

  if (changed.length === 0) throw new Error("Nothing to change");
  return changed;
}

// Fields the gap-filler may set — only ever when they're currently empty.
const INFERABLE = ["role", "company", "school", "met_at", "how_they_help"] as const;
type Inferable = (typeof INFERABLE)[number];

const FILL_GAPS_TOOL = {
  name: "fill_gaps",
  description:
    "Fill empty fields on a contact's profile that the rest of the profile clearly implies. Omit every field you are not confident about.",
  input_schema: {
    type: "object" as const,
    properties: {
      met_at: {
        type: "string",
        description:
          "How or why the user knows this person, when another field makes it plain — e.g. role 'My mom' → 'my mom'; notes 'lives next door' → 'neighbor'; school 'Stanford' plus notes 'my roommate' → 'Stanford roommates'. Short, lowercase, in the user's voice.",
      },
      role: {
        type: "string",
        description:
          "Their job title when the notes state it outright — or, with no job given, their relationship to the user when it's personal: met_at 'my sister' → 'Sister'; 'my mom' → 'Mom'; 'neighbor' → 'Neighbor'. Not for professional origins like 'SF demo day'.",
      },
      company: {
        type: "string",
        description:
          "Their company, only when the notes or role state it outright. Everyday short name ('Google', not 'Google LLC').",
      },
      school: {
        type: "string",
        description: "Their school, only when stated outright. Short name ('UC Berkeley').",
      },
      how_they_help: {
        type: "string",
        description:
          "How they could help the user, only when the notes say it outright. Never invent an angle.",
      },
    },
  },
};

// After a manual edit on the profile, let Claude fill empty fields the edit
// implies (role "My mom" → met because "my mom"). Never touches a field that
// already has a value, so it can't undo what the user typed. Returns what it
// filled.
export async function inferPersonGaps(
  personId: string
): Promise<Partial<Record<Inferable, string>>> {
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("name, role, company, school, met_at, how_they_help, notes")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return {};

  const empty = INFERABLE.filter((k) => !person[k]?.trim());
  if (empty.length === 0) return {};
  const known = Object.entries(person)
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const { anthropic } = await import("@/lib/anthropic");
  let response;
  try {
    response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      tool_choice: { type: "tool", name: "fill_gaps" },
      tools: [FILL_GAPS_TOOL],
      messages: [
        {
          role: "user",
          content: `Here is a contact from the user's personal network. "The user" is the person who owns this contact list, so "my mom" in a field means the contact is the user's mother.

${known}

Empty fields you may fill: ${empty.join(", ")}.

Fill an empty field only when the existing fields make its value plain — a reasonable person reading them would say the same thing. Leave anything uncertain out. Never output placeholders.`,
        },
      ],
    });
  } catch {
    // Gap-filling is a nicety — a failed call just leaves the fields empty.
    return {};
  }

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return {};
  const input = toolUse.input as Partial<Record<Inferable, string>>;

  const patch: Partial<Record<Inferable, string>> = {};
  for (const k of empty) {
    const v = input[k]?.trim();
    if (v && !/unknown|n\/a/i.test(v)) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) return {};

  const { error } = await supabase.from("people").update(patch).eq("id", personId);
  if (error) return {};
  return patch;
}

const PHOTO_BUCKET = "person-photos";

// Store a person's photo (a square JPEG prepared client-side) under the
// user's own folder, replacing any previous one. The filename carries a
// timestamp so a new photo never hits a cached copy of the old.
export async function setPersonPhoto(personId: string, form: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const photo = form.get("photo");
  if (!(photo instanceof Blob) || photo.size === 0) throw new Error("No photo");
  if (photo.type !== "image/jpeg") throw new Error("Photo must be a JPEG");
  if (photo.size > 900_000) throw new Error("Photo is too large");

  const { data: person } = await supabase
    .from("people")
    .select("photo_path")
    .eq("id", personId)
    .maybeSingle();
  if (!person) throw new Error("Person not found");

  const path = `${user.id}/${personId}-${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, photo, { contentType: "image/jpeg" });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase.from("people").update({ photo_path: path }).eq("id", personId);
  if (error) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    throw new Error(error.message);
  }
  if (person.photo_path) await supabase.storage.from(PHOTO_BUCKET).remove([person.photo_path]);
  revalidatePath(`/people/${personId}`);
}

export async function removePersonPhoto(personId: string) {
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("photo_path")
    .eq("id", personId)
    .maybeSingle();
  if (!person?.photo_path) return;
  const { error } = await supabase.from("people").update({ photo_path: null }).eq("id", personId);
  if (error) throw new Error(error.message);
  await supabase.storage.from(PHOTO_BUCKET).remove([person.photo_path]);
  revalidatePath(`/people/${personId}`);
}
