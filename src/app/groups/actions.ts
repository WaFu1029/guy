"use server";

import { createClient } from "@/lib/supabase/server";
import { GROUP_COLOR_PRESETS, presetColorForIndex } from "@/lib/groupColors";
import type { Group } from "@/types/database";

export async function createGroup(name: string): Promise<Group> {
  // Title-case the name so voice-created groups ("family") match the look of
  // hand-made ones ("Family").
  const trimmed = name
    .trim()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  if (!trimmed) throw new Error("Group name is required");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // Reuse an existing group with the same name instead of duplicating it.
  const { data: existing } = await supabase
    .from("groups")
    .select("*")
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle();
  if (existing) return existing as Group;

  // First palette color no existing group is wearing; wrap by count only when
  // all ten are taken.
  const { data: existingGroups } = await supabase.from("groups").select("color");
  const used = new Set((existingGroups ?? []).map((g) => g.color));
  const color =
    GROUP_COLOR_PRESETS.find((c) => !used.has(c)) ??
    presetColorForIndex(existingGroups?.length ?? 0);

  const { data: group, error } = await supabase
    .from("groups")
    .insert({ user_id: user.id, name: trimmed, color })
    .select()
    .single();
  if (error || !group) throw new Error(error?.message ?? "Failed to create group");
  return group as Group;
}

export async function updateGroup(
  groupId: string,
  fields: { name?: string; color?: string; description?: string }
): Promise<Group> {
  const patch: { name?: string; color?: string; description?: string | null } = {};
  if (fields.name !== undefined) {
    const name = fields.name.trim();
    if (!name) throw new Error("Group name is required");
    patch.name = name;
  }
  if (fields.color !== undefined) {
    // Colors come from the fixed palette only — no arbitrary strings into the DB.
    if (!GROUP_COLOR_PRESETS.includes(fields.color)) throw new Error("Unknown color");
    patch.color = fields.color;
  }
  if (fields.description !== undefined) {
    patch.description = fields.description.trim() || null;
  }
  if (Object.keys(patch).length === 0) throw new Error("Nothing to update");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // RLS scopes the update to the owner's rows.
  const { data: group, error } = await supabase
    .from("groups")
    .update(patch)
    .eq("id", groupId)
    .select()
    .single();
  if (error || !group) throw new Error(error?.message ?? "Failed to update group");
  return group as Group;
}
