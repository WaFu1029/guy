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
import { PersonPhoto } from "@/components/PersonPhoto";

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

  // Private bucket: a short-lived signed URL, minted per page render.
  const photoUrl = person.photo_path
    ? ((await supabase.storage.from("person-photos").createSignedUrl(person.photo_path, 60 * 60))
        .data?.signedUrl ?? null)
    : null;

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-8 pt-2 lg:max-w-7xl lg:px-7">
      <Link href="/" className="text-sm text-neutral-400 dark:text-neutral-500 hover:underline">
        ← Network
      </Link>

      {/* Phone: one card. Desktop: the profile on the left, everything that
          hangs off it — connections, follow-ups, danger zone — on the right. */}
      <div className="mt-3 flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
      <div className="rounded-3xl bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-50 px-5 py-6 lg:px-7">
        <div className="flex items-center gap-4">
          <PersonPhoto personId={person.id} name={person.name} url={photoUrl} />
          <div className="min-w-0 flex-1">
            <PersonNameEdit personId={person.id} name={person.name} />
          </div>
        </div>

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
            followUps={(followUps ?? []).filter((f) => f.status === "pending" || f.status === "snoozed")}
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
                // Each end links to that person's profile — except You and the
                // person this page is already about.
                const end = (id: string | null, name: string) =>
                  id && id !== person.id ? (
                    <Link
                      href={`/people/${id}`}
                      className="underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900 hover:decoration-neutral-900 dark:decoration-neutral-600 dark:hover:text-neutral-50 dark:hover:decoration-neutral-50"
                    >
                      {name}
                    </Link>
                  ) : (
                    name
                  );
                return (
                  <li key={c.id} className="rounded-xl bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200">
                    {end(c.from_person_id, fromName)} → {end(c.to_person_id, toName)}
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
          <PersonFollowUps
            personId={person.id}
            personName={person.name}
            followUps={followUps ?? []}
          />
        </div>

        <div className="rounded-3xl bg-neutral-100 dark:bg-neutral-900 px-5 py-5">
          <DeletePersonButton personId={person.id} personName={person.name} />
        </div>
      </div>
      </div>
    </div>
  );
}
