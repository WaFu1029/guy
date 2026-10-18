"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FollowUp } from "@/types/database";

export async function completeFollowUp(followUpId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("follow_ups")
    .update({ status: "completed" })
    .eq("id", followUpId);

  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function snoozeFollowUp(followUpId: string, hours: number) {
  const supabase = await createClient();
  const dueAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  const { error } = await supabase
    .from("follow_ups")
    .update({ status: "snoozed", due_at: dueAt.toISOString() })
    .eq("id", followUpId);

  if (error) throw new Error(error.message);
  revalidatePath("/");
}

// Schedule a follow-up from a person's profile. `hours` is an offset from now,
// matching the chips the log form offers.
export async function createFollowUp(
  personId: string,
  hours: number,
  notes?: string
): Promise<FollowUp> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  if (!Number.isFinite(hours) || hours <= 0) throw new Error("Pick when to follow up");

  const dueAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from("follow_ups")
    .insert({
      user_id: user.id,
      person_id: personId,
      due_at: dueAt.toISOString(),
      notes: notes?.trim() || null,
    })
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to schedule follow-up");

  revalidatePath("/");
  revalidatePath(`/people/${personId}`);
  return data as FollowUp;
}

// Edit an existing follow-up from the profile — by hand or by voice. A new due
// time puts a snoozed follow-up back to pending; `action` closes it out.
export async function updateFollowUp(
  followUpId: string,
  changes: { dueAt?: string; notes?: string | null; action?: "complete" | "dismiss" }
): Promise<FollowUp> {
  const supabase = await createClient();
  const patch: Partial<FollowUp> = {};
  if (changes.dueAt !== undefined) {
    const due = new Date(changes.dueAt);
    if (Number.isNaN(due.getTime())) throw new Error("That date didn't make sense");
    patch.due_at = due.toISOString();
    patch.status = "pending";
  }
  if (changes.notes !== undefined) patch.notes = changes.notes?.trim() || null;
  if (changes.action === "complete") patch.status = "completed";
  if (changes.action === "dismiss") patch.status = "dismissed";
  if (Object.keys(patch).length === 0) throw new Error("Nothing to change");

  const { data, error } = await supabase
    .from("follow_ups")
    .update(patch)
    .eq("id", followUpId)
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update follow-up");

  revalidatePath("/");
  revalidatePath(`/people/${data.person_id}`);
  return data as FollowUp;
}
