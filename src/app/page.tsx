import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ConnectionGraph } from "@/components/ConnectionGraph";
import { FollowUpBar, type DueFollowUp } from "@/components/FollowUpBar";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: people }, { data: connections }, { data: groups }, { data: dueFollowUps }] =
    await Promise.all([
    supabase.from("people").select("*").order("created_at", { ascending: false }),
    supabase.from("connections").select("*"),
    supabase.from("groups").select("*").order("created_at", { ascending: true }),
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
    // TopNav is 3.75rem tall (pt-6 + text-xl line + pb-2); the page takes
    // exactly the rest of the viewport so the graph + bar always end at the
    // bottom edge — no overflow, no dead space.
    <div className="mx-auto flex h-[calc(100dvh-3.75rem)] w-full max-w-md flex-col gap-3 px-4 pb-4 pt-2">
      {people && people.length > 0 ? (
        <>
          <div className="min-h-0 flex-1">
            <ConnectionGraph
              people={people}
              connections={connections ?? []}
              groups={groups ?? []}
            />
          </div>
          <div className="shrink-0">
            <FollowUpBar followUps={followUps} />
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl bg-neutral-100 dark:bg-neutral-900 p-8 text-center">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No connections yet. Log the first person you meet.
          </p>
          <Link
            href="/log"
            className="rounded-full bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:text-neutral-50 px-5 py-2.5 text-sm font-medium text-neutral-50"
          >
            Log a connection
          </Link>
        </div>
      )}
    </div>
  );
}
