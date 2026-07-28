import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ConnectionGraph } from "@/components/ConnectionGraph";
import { ReminderBanner, type DueFollowUp } from "@/components/ReminderBanner";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: people }, { data: connections }, { data: dueFollowUps }] = await Promise.all([
    supabase.from("people").select("*").order("created_at", { ascending: false }),
    supabase.from("connections").select("*"),
    supabase
      .from("follow_ups")
      .select("*, people(name)")
      .eq("status", "pending")
      .lte("due_at", new Date().toISOString())
      .order("due_at", { ascending: true }),
  ]);

  const followUps: DueFollowUp[] = (dueFollowUps ?? []).map((f) => ({
    ...f,
    person_name: (f as unknown as { people: { name: string } }).people?.name ?? "Someone",
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-50">Your network</h1>
          <p className="text-sm text-neutral-400">
            {people?.length ?? 0} connection{(people?.length ?? 0) === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/capture"
          className="rounded-full bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-900"
        >
          Log a connection
        </Link>
      </div>

      <ReminderBanner followUps={followUps} />

      {people && people.length > 0 ? (
        <div className="mt-6">
          <ConnectionGraph people={people} connections={connections ?? []} />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-10 text-center">
          <p className="text-sm text-neutral-400">
            No connections yet. Head to a networking event and log the first person you meet.
          </p>
        </div>
      )}
    </div>
  );
}
