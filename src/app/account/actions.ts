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
