import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileVoiceEdit } from "@/components/ProfileVoiceEdit";
import { ContactChips } from "@/components/ContactChips";
import { personContextLine } from "@/lib/personContext";
import { vocabLine } from "@/lib/vocab";
import { DeletePersonButton } from "@/components/DeletePersonButton";
import { ProfileFields } from "@/components/ProfileFields";
import { LeadHeatPicker } from "@/components/LeadHeatPicker";
import { PersonNameEdit } from "@/components/PersonNameEdit";
import { PersonFollowUps } from "@/components/PersonFollowUps";
import { PersonGroupPicker } from "@/components/PersonGroupPicker";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: person } = await supabase.from("people").select("*").eq("id", id).single();
  if (!person) notFound();

  const [
    { data: connections },
    { data: followUps },
    { data: groups },
    { data: allPeople },
    { data: vocab },
  ] = await Promise.all([
    supabase
      .from("connections")
      .select("*, from:from_person_id(name), to:to_person_id(name)")
      .or(`from_person_id.eq.${id},to_person_id.eq.${id}`),
    supabase
      .from("follow_ups")
      .select("*")
      .eq("person_id", id)
      .order("due_at", { ascending: false }),
    supabase.from("groups").select("*").order("created_at", { ascending: true }),
    supabase.from("people").select("name, role, company, notes"),
    supabase
      .from("vocab_terms")
      .select("term, hint, aliases")
      .order("created_at", { ascending: true }),
  ]);

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-8 pt-2 lg:max-w-7xl lg:px-7">
      <Link href="/" className="text-sm text-neutral-400 dark:text-neutral-500 hover:underline">
        ← Network
      </Link>

      {/* Phone: one card. Desktop: the profile on the left, everything that
          hangs off it — connections, follow-ups, danger zone — on the right. */}
      <div className="mt-3 flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
      <div className="rounded-3xl bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-50 px-5 py-6 lg:px-7">
        <PersonNameEdit personId={person.id} name={person.name} />

        <LeadHeatPicker personId={person.id} heat={person.lead_heat} />

        <PersonGroupPicker
          personId={person.id}
          groupId={person.group_id}
          groups={groups ?? []}
        />

        <ProfileFields person={person} />

        <ContactChips person={person} className="mt-3" />

        <div className="mt-4 rounded-xl bg-white dark:bg-neutral-800 px-3 py-3">
          <ProfileVoiceEdit
            personId={person.id}
            personName={person.name}
            currentNotes={person.notes ?? ""}
            groupNames={(groups ?? []).map((g) => g.name)}
            peopleNames={(allPeople ?? []).map(personContextLine)}
            vocabulary={(vocab ?? []).map(vocabLine)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {connections && connections.length > 0 && (
          <div className="rounded-3xl bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-50 px-5 py-5">
            <h2 className="mb-1 text-sm font-semibold text-neutral-900 dark:text-neutral-50">Connections</h2>
            <ul className="flex flex-col gap-2">
              {connections.map((c) => {
                const fromName =
                  (c as unknown as { from: { name: string } | null }).from?.name ?? "You";
                const toName =
                  (c as unknown as { to: { name: string } | null }).to?.name ?? "You";
                return (
                  <li key={c.id} className="rounded-xl bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200">
                    {fromName} → {toName}
                    {c.label && (
                      <span className="ml-2 text-neutral-400 dark:text-neutral-500">
                        ({c.label})
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="rounded-3xl bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-50 px-5 py-5">
          <PersonFollowUps personId={person.id} followUps={followUps ?? []} />
        </div>

        <div className="rounded-3xl bg-neutral-100 dark:bg-neutral-900 px-5 py-5">
          <DeletePersonButton personId={person.id} personName={person.name} />
        </div>
      </div>
      </div>
    </div>
  );
}
