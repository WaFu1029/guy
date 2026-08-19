import { createClient } from "@/lib/supabase/server";
import { personContextLine } from "@/lib/personContext";
import { LogForm } from "@/components/LogForm";

export default async function LogPage() {
  const supabase = await createClient();
  const [{ data: groups }, { data: people }, { data: vocab }] = await Promise.all([
    supabase.from("groups").select("*").order("created_at", { ascending: true }),
    supabase
      .from("people")
      .select("name, role, company, notes")
      .order("name", { ascending: true }),
    supabase.from("vocab_terms").select("term, hint").order("created_at", { ascending: true }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-6 pt-2 lg:max-w-7xl lg:px-7">
      <LogForm
        groups={groups ?? []}
        peopleContext={(people ?? []).map(personContextLine)}
        networkPeople={(people ?? []).map((p) => ({
          name: p.name,
          role: p.role,
          company: p.company,
        }))}
        vocabulary={(vocab ?? []).map((v) =>
          v.hint ? `${v.term} (${v.hint})` : v.term
        )}
      />
    </div>
  );
}
