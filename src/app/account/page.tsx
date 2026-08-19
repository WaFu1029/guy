import { createClient } from "@/lib/supabase/server";
import { GroupManager } from "@/components/GroupManager";
import { ContactBook } from "@/components/ContactBook";
import { AccountDanger } from "@/components/AccountDanger";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: people }, { data: groups }, { count: pendingCount }] = await Promise.all([
    supabase.from("people").select("*").order("name", { ascending: true }),
    supabase.from("groups").select("*").order("created_at", { ascending: true }),
    supabase
      .from("follow_ups")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  return (
    // Phone: one stacked column. Desktop: account + appearance + groups on the
    // left, the contact book (the tallest card by far) on the right.
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pb-8 pt-2 lg:max-w-7xl lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:px-7">
      <div className="flex flex-col gap-3">
      <div className="rounded-3xl bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-50 px-5 py-5">
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Signed in as</p>
        <p className="mt-1 rounded-xl bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-50">{user.email}</p>
        <div className="mt-3 flex gap-3">
          <div className="flex-1 rounded-xl bg-white dark:bg-neutral-800 px-3 py-3 text-center">
            <p className="text-xl font-bold text-neutral-900 dark:text-neutral-50">{people?.length ?? 0}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">connections</p>
          </div>
          <div className="flex-1 rounded-xl bg-white dark:bg-neutral-800 px-3 py-3 text-center">
            <p className="text-xl font-bold text-neutral-900 dark:text-neutral-50">{pendingCount ?? 0}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">follow-ups pending</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-50 px-5 py-5">
        <p className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-50">Appearance</p>
        <ThemeToggle />
      </div>

      <div className="rounded-3xl bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-50 px-5 py-5">
        <p className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-50">Groups</p>
        <GroupManager groups={groups ?? []} />
      </div>

      <div className="rounded-3xl bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-50 px-5 py-5">
        <AccountDanger />
      </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-3xl bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-50 px-5 py-5">
          <p className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-50">Contacts</p>
          <ContactBook people={people ?? []} groups={groups ?? []} />
        </div>
      </div>
    </div>
  );
}
