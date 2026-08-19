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
