import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { orgMembers } from "@/lib/orgHubs";
import { OrgColorPicker } from "@/components/OrgColorPicker";

// A school or company page: who in your network belongs to it, and the color
// its hub takes on the graph.
export default async function OrgPage({
  params,
}: {
  params: Promise<{ kind: string; key: string }>;
}) {
  const { kind, key: rawKey } = await params;
  if (kind !== "school" && kind !== "company") notFound();
  const key = decodeURIComponent(rawKey);
  const orgKey = `${kind}:${key}`;

  const supabase = await createClient();
  const [{ data: people }, { data: profile }, { data: style }, { data: groups }] =
    await Promise.all([
      supabase.from("people").select("*").order("name", { ascending: true }),
      supabase.from("profiles").select("*").maybeSingle(),
      supabase.from("org_styles").select("color").eq("org_key", orgKey).maybeSingle(),
      supabase.from("groups").select("id, color"),
    ]);

  const { members, label } = orgMembers(people ?? [], profile ?? null, kind, key);
  if (members.length === 0 || !label) notFound();
  const groupColor = new Map((groups ?? []).map((g) => [g.id, g.color]));
  const color = style?.color ?? null;

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-8 pt-2 lg:max-w-3xl lg:px-7">
      <Link href="/" className="text-sm text-neutral-400 dark:text-neutral-500 hover:underline">
        ← Network
      </Link>

      <div className="mt-3 rounded-3xl bg-neutral-100 px-5 py-6 dark:bg-neutral-900 dark:text-neutral-50 lg:px-7">
        <div className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold"
            style={{
              backgroundColor: color ?? "var(--g-org-fill)",
              color: color ? "#171717" : "var(--g-org-text)",
            }}
          >
            {label[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-bold text-neutral-900 dark:text-neutral-50">{label}</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {kind === "school" ? "School" : "Company"} · {members.length}{" "}
              {members.length === 1 ? "person" : "people"}
            </p>
          </div>
        </div>

        <p className="mt-6 text-sm font-semibold text-neutral-900 dark:text-neutral-50">Color</p>
        <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
          How {label} shows up on your network map.
        </p>
        <OrgColorPicker orgKey={orgKey} color={color} />

        <p className="mt-6 mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-50">People</p>
        <ul className="flex flex-col gap-2">
          {members.map((m) => {
            const dot = m.groupId ? groupColor.get(m.groupId) : null;
            const body = (
              <>
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: dot ?? "transparent" }}
                />
                <span className="font-medium text-neutral-900 dark:text-neutral-50">
                  {m.name}
                  {m.isSelf && <span className="font-normal text-neutral-500"> (you)</span>}
                </span>
                {m.role && <span className="truncate text-neutral-500 dark:text-neutral-400">{m.role}</span>}
              </>
            );
            return (
              <li key={m.id}>
                {m.isSelf ? (
                  <Link
                    href="/account"
                    className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                  >
                    {body}
                  </Link>
                ) : (
                  <Link
                    href={`/people/${m.id}`}
                    className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
