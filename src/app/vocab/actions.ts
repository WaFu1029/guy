"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { VocabTerm } from "@/types/database";

// The user's spoken-word canon: names and terms the transcriber gets wrong,
// stored with the spelling they actually want. RLS scopes every query.

export async function addVocabTerm(term: string, hint?: string): Promise<VocabTerm> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const trimmed = term.trim();
  if (!trimmed) throw new Error("A term is required");

  // Case-insensitive dedupe — the same name twice would just double its weight
  // in the prompt.
  const { data: existing } = await supabase
    .from("vocab_terms")
    .select("*")
    .ilike("term", trimmed)
    .limit(1)
    .maybeSingle();
  if (existing) return existing as VocabTerm;

  const { data, error } = await supabase
    .from("vocab_terms")
    .insert({ user_id: user.id, term: trimmed, hint: hint?.trim() || null })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to add term");

  revalidatePath("/account");
  return data as VocabTerm;
}

export async function deleteVocabTerm(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.from("vocab_terms").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/account");
}
