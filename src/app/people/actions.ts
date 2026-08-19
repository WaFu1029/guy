"use server";

import { createClient } from "@/lib/supabase/server";
import { createGroup } from "@/app/groups/actions";
import type { PersonUpdate } from "@/types/extraction";
import type { Person } from "@/types/database";

// Direct inline edit of a person's fields from the profile page. Empty strings
// clear the column; handles strip a leading @. RLS scopes the update.
export async function updatePersonFields(
  personId: string,
  fields: {
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
