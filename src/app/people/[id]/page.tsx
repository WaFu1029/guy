import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FollowUpActions } from "@/components/FollowUpActions";

const RELATIONSHIP_LABELS: Record<string, string> = {
  met_at_event: "Met at an event",
  introduced_by: "Introduced by",
  works_with: "Works with",
  other: "Other",
};

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: person } = await supabase.from("people").select("*").eq("id", id).single();
  if (!person) notFound();

  const [{ data: connections }, { data: followUps }] = await Promise.all([
    supabase
      .from("connections")
      .select("*, from:from_person_id(name), to:to_person_id(name)")
      .or(`from_person_id.eq.${id},to_person_id.eq.${id}`),
    supabase
      .from("follow_ups")
      .select("*")
      .eq("person_id", id)
      .order("due_at", { ascending: false }),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-neutral-400 hover:underline">
        ← Back to network
      </Link>

      <h1 className="mt-3 text-2xl font-semibold text-neutral-50">{person.name}</h1>
      <p className="text-sm text-neutral-400">
        {[person.role, person.company].filter(Boolean).join(" at ") || "No role/company noted"}
      </p>
      {person.met_at && (
        <p className="mt-1 text-sm text-neutral-500">Met at {person.met_at}</p>
      )}

      {person.notes && (
        <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="mb-1 text-sm font-medium text-neutral-300">Notes</h2>
          <p className="whitespace-pre-wrap text-sm text-neutral-400">{person.notes}</p>
        </div>
      )}

      {connections && connections.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-neutral-300">Connections</h2>
          <ul className="flex flex-col gap-2">
            {connections.map((c) => {
              const fromName = (c as unknown as { from: { name: string } | null }).from?.name ?? "You";
              const toName = (c as unknown as { to: { name: string } | null }).to?.name ?? "You";
              return (
                <li
                  key={c.id}
                  className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm text-neutral-300"
                >
                  {fromName} → {toName}
                  <span className="ml-2 text-neutral-500">
                    ({c.label || RELATIONSHIP_LABELS[c.relationship_type]})
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {followUps && followUps.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-neutral-300">Follow-ups</h2>
          <ul className="flex flex-col gap-2">
            {followUps.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm"
              >
                <div>
                  <p className="text-neutral-300">
                    Due {new Date(f.due_at).toLocaleString()} — {f.status}
                  </p>
                </div>
                {f.status === "pending" && <FollowUpActions followUpId={f.id} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
