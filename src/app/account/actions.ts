"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
