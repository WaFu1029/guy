"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

// The user's own details — name, what they do, school, company. Upserted on
// user_id (the primary key), so the row is created on first save. Empty
// strings clear a column. RLS scopes the write.
export async function updateProfile(fields: {
  name?: string;
  role?: string;
  school?: string;
  company?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const patch: Partial<Profile> & { user_id: string } = { user_id: user.id };
  for (const key of ["name", "role", "school", "company"] as const) {
    if (fields[key] !== undefined) patch[key] = fields[key]!.trim() || null;
  }

  const { error } = await supabase.from("profiles").upsert(patch, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

export async function deletePerson(personId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // RLS scopes the delete; connections and follow_ups cascade via FKs.
  const { error } = await supabase.from("people").delete().eq("id", personId);
  if (error) throw new Error(error.message);

  // The deleted person may have been someone else's only link into the graph
  // (e.g. "introduced by"). Re-anchor any now-orphaned people to You so no
  // node floats disconnected.
  const [{ data: people }, { data: connections }] = await Promise.all([
    supabase.from("people").select("id"),
    supabase.from("connections").select("from_person_id, to_person_id"),
  ]);
  const linked = new Set<string>();
  for (const c of connections ?? []) {
    if (c.from_person_id) linked.add(c.from_person_id);
    linked.add(c.to_person_id);
  }
  const orphans = (people ?? []).filter((p) => !linked.has(p.id));
  if (orphans.length > 0) {
    const { error: reanchorError } = await supabase.from("connections").insert(
      orphans.map((p) => ({
        user_id: user.id,
        from_person_id: null,
        to_person_id: p.id,
        relationship_type: "other" as const,
        label: null,
      }))
    );
    if (reanchorError) throw new Error(reanchorError.message);
  }
}

// Profile-page delete: remove the person, then leave the now-dead page via a
// server-side redirect so the client never re-renders a missing record.
export async function deletePersonAndGoHome(personId: string) {
  await deletePerson(personId);
  redirect("/");
}

export async function deleteAllData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // people cascades connections + follow_ups; groups go separately.
  const { error: peopleError } = await supabase.from("people").delete().eq("user_id", user.id);
  if (peopleError) throw new Error(peopleError.message);
  const { error: groupsError } = await supabase.from("groups").delete().eq("user_id", user.id);
  if (groupsError) throw new Error(groupsError.message);

  await supabase.auth.signOut();
  redirect("/login");
}
