import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FollowUpActions } from "@/components/FollowUpActions";
import { ProfileVoiceEdit } from "@/components/ProfileVoiceEdit";
import { ContactChips } from "@/components/ContactChips";
import { personContextLine } from "@/lib/personContext";
import { DeletePersonButton } from "@/components/DeletePersonButton";
import { ProfileFields } from "@/components/ProfileFields";
import { LeadHeatPicker } from "@/components/LeadHeatPicker";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: person } = await supabase.from("people").select("*").eq("id", id).single();
  if (!person) notFound();

  const [{ data: connections }, { data: followUps }, { data: groups }, { data: allPeople }] =
    await Promise.all([
    supabase
      .from("connections")
      .select("*, from:from_person_id(name), to:to_person_id(name)")
      .or(`from_person_id.eq.${id},to_person_id.eq.${id}`),
    supabase
      .from("follow_ups")
      .select("*")
      .eq("person_id", id)
      .order("due_at", { ascending: false }),
    supabase.from("groups").select("name"),
    supabase.from("people").select("name, role, company, notes"),
  ]);

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-8 pt-2">
      <Link href="/" className="text-sm text-neutral-400 dark:text-neutral-500 hover:underline">
        ← Network
      </Link>

      <div className="mt-3 rounded-3xl bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-50 px-5 py-6">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">{person.name}</h1>

        <LeadHeatPicker personId={person.id} heat={person.lead_heat} />

        <ProfileFields person={person} />

        <ContactChips person={person} className="mt-3" />

        <div className="mt-4 rounded-xl bg-white dark:bg-neutral-800 px-3 py-3">
          <ProfileVoiceEdit
            personId={person.id}
            personName={person.name}
            currentNotes={person.notes ?? ""}
            groupNames={(groups ?? []).map((g) => g.name)}
            peopleNames={(allPeople ?? []).map(personContextLine)}
          />
        </div>

        {connections && connections.length > 0 && (
          <div className="mt-4">
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

        {followUps && followUps.length > 0 && (
          <div className="mt-4">
            <h2 className="mb-1 text-sm font-semibold text-neutral-900 dark:text-neutral-50">Follow-ups</h2>
            <ul className="flex flex-col gap-2">
              {followUps.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded-xl bg-white dark:bg-neutral-800 px-3 py-2 text-sm"
                >
                  <p className="text-neutral-700 dark:text-neutral-200">
                    Due {new Date(f.due_at).toLocaleString()}
                    {f.notes ? ` — ${f.notes}` : ""}
                  </p>
                  {f.status === "pending" && <FollowUpActions followUpId={f.id} />}
                </li>
              ))}
            </ul>
          </div>
        )}
        <DeletePersonButton personId={person.id} personName={person.name} />
      </div>
    </div>
  );
}
