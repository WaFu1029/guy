"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

