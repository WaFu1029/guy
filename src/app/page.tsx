import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NetworkDesk } from "@/components/NetworkDesk";
import type { DueFollowUp } from "@/components/FollowUpBar";

export default async function HomePage() {
  const supabase = await createClient();

  // Deliberately no getUser() here. proxy.ts already redirects signed-out
  // requests to /login, and every query below is scoped by RLS
  // (auth.uid() = user_id) — so the check guarded nothing, while costing a
  // second sequential round trip to the Supabase auth server (~150ms) before
  // any data fetching could start.
  const [
    { data: people },
    { data: connections },
    { data: groups },
    { data: dueFollowUps },
    { data: profile },
  ] = await Promise.all([
    supabase.from("people").select("*").order("created_at", { ascending: false }),
    supabase.from("connections").select("*"),
    supabase.from("groups").select("*").order("created_at", { ascending: true }),
    supabase
      .from("follow_ups")
      .select("*, people(name)")
      .eq("status", "pending")
      .lte("due_at", new Date().toISOString())
      .order("due_at", { ascending: true }),
    // The user's own details — absent until they fill them in on /account.
    supabase.from("profiles").select("*").maybeSingle(),
  ]);

  const followUps: DueFollowUp[] = (dueFollowUps ?? []).map((f) => ({
    ...f,
    person_name: (f as unknown as { people: { name: string } }).people?.name ?? "Someone",
  }));

  return (
    // TopNav is 3.75rem tall (pt-6 + text-xl line + pb-2); the page takes
    // exactly the rest of the viewport so the graph + panels always end at the
    // bottom edge — no overflow, no dead space.
    <div className="mx-auto flex h-[calc(100dvh-3.75rem)] w-full max-w-md flex-col gap-3 px-4 pb-4 pt-2 lg:max-w-7xl lg:px-7">
      {people && people.length > 0 ? (
        <NetworkDesk
          people={people}
          connections={connections ?? []}
          groups={groups ?? []}
          followUps={followUps}
          profile={profile ?? null}
        />
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
