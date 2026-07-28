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
      notes: extracted.context ?? null,
      raw_transcript: rawTranscript,
      met_at: extracted.met_at ?? null,
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

  if (extracted.follow_up_hours) {
    const dueAt = new Date(Date.now() + extracted.follow_up_hours * 60 * 60 * 1000);
    const { error: followUpError } = await supabase.from("follow_ups").insert({
      user_id: user.id,
      person_id: person.id,
      due_at: dueAt.toISOString(),
      notes: extracted.context ?? null,
    });

    if (followUpError) {
      throw new Error(followUpError.message);
    }
  }

  return person.id as string;
}
