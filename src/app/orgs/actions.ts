"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Set (or with null, clear) the user's color for an org hub. `orgKey` is the
// hub id without its "org:" prefix — "school:columbia".
export async function setOrgColor(orgKey: string, color: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  if (!/^(school|company):.+/.test(orgKey)) throw new Error("Unknown organization");

  if (color === null) {
    const { error } = await supabase.from("org_styles").delete().eq("org_key", orgKey);
    if (error) throw new Error(error.message);
  } else {
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Pick a color");
    const { error } = await supabase
      .from("org_styles")
      .upsert({ user_id: user.id, org_key: orgKey, color, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/");
}
