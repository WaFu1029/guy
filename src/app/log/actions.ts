"use server";

import { createClient } from "@/lib/supabase/server";
import type { ExtractedConnection } from "@/types/extraction";

export async function saveConnection(extracted: ExtractedConnection, rawTranscript: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not signed in");
  }

  const { data: person, error: personError } = await supabase
    .from("people")
    .insert({
      user_id: user.id,
      name: extracted.name,
      role: extracted.role ?? null,
      company: extracted.company ?? null,
      school: extracted.school ?? null,
      notes: extracted.context ?? null,
      how_they_help: extracted.how_they_help ?? null,
      raw_transcript: rawTranscript || null,
      met_at: extracted.met_at ?? null,
      phone: extracted.phone ?? null,
      email: extracted.email ?? null,
      instagram: extracted.instagram ?? null,
      twitter: extracted.twitter ?? null,
      group_id: extracted.group_id ?? null,
      lead_heat: extracted.lead_heat ?? null,
    })
    .select()
    .single();

  if (personError || !person) {
    throw new Error(personError?.message ?? "Failed to save person");
  }

  const { error: connectionError } = await supabase.from("connections").insert({
    user_id: user.id,
    from_person_id: null,
    to_person_id: person.id,
    relationship_type: extracted.relationship_type ?? "met_at_event",
    label: extracted.relationship_label ?? extracted.met_at ?? null,
  });

  if (connectionError) {
    throw new Error(connectionError.message);
  }

  // "Also knows" names become person↔person edges. Each name matches an
  // existing person case-insensitively, or gets a stub person row so the
  // network still shows them.
  for (const known of extracted.also_knows ?? []) {
    const name = known.name.trim();
    if (!name || name.toLowerCase() === extracted.name.trim().toLowerCase()) continue;

    const { data: existing } = await supabase
      .from("people")
      .select("id")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();

    let otherId = existing?.id as string | undefined;
    if (!otherId) {
      const { data: stub, error: stubError } = await supabase
        .from("people")
        .insert({ user_id: user.id, name })
        .select()
        .single();
      if (stubError || !stub) continue;
      otherId = stub.id as string;
    }

    await supabase.from("connections").insert({
      user_id: user.id,
      from_person_id: person.id,
      to_person_id: otherId,
      relationship_type: "other",
      label: known.relationship?.trim() || null,
    });
  }

  if (extracted.follow_up_hours) {
    const dueAt = new Date(Date.now() + extracted.follow_up_hours * 60 * 60 * 1000);
    const { error: followUpError } = await supabase.from("follow_ups").insert({
      user_id: user.id,
      person_id: person.id,
      due_at: dueAt.toISOString(),
      notes: extracted.follow_up_about ?? extracted.context ?? null,
    });

    if (followUpError) {
      throw new Error(followUpError.message);
    }
  }

  return person.id as string;
}
