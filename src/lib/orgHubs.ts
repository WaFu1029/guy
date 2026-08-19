import type { Person, Profile } from "@/types/database";

// The graph id of the user's own node. The user is a member of an org hub
// like anyone else, so hub members carry ids from both spaces.
export const SELF_ID = "you";

export type OrgMember = {
  // A person id, or SELF_ID when this member is the user.
  id: string;
  name: string;
  role: string | null;
  // Group color assignment, for the graph's legend focus. Always null for You.
  groupId: string | null;
  isSelf: boolean;
};

// A derived org hub: synthesized at render time when ≥2 people (the user
// counts) share a company or school (case-insensitive). Never stored.
export type OrgHub = {
  id: string;
  kind: "company" | "school";
  label: string;
  members: OrgMember[];
};

// Bucket people by company and by school, keep buckets with ≥2 members.
// The user's own profile joins the buckets too, so "you + one Columbian"
// is enough to raise a Columbia hub with You wired into it.
// Shared by the graph (which renders hub nodes) and by anything that needs to
// resolve a pinned hub id back into its members.
export function deriveOrgHubs(
  people: Person[],
  profile?: Profile | null
): Map<string, OrgHub> {
  const entries: { member: OrgMember; company: string | null; school: string | null }[] =
    people.map((p) => ({
      member: {
        id: p.id,
        name: p.name,
        role: p.role,
        groupId: p.group_id,
        isSelf: false,
      },
      company: p.company,
      school: p.school,
    }));
  if (profile && (profile.company || profile.school)) {
    entries.push({
      member: {
        id: SELF_ID,
        name: profile.name?.trim() || "You",
        role: profile.role,
        groupId: null,
        isSelf: true,
      },
      company: profile.company,
      school: profile.school,
    });
  }

  const buckets = new Map<string, OrgHub>();
  for (const entry of entries) {
    const sources = [
      { kind: "company" as const, value: entry.company },
      { kind: "school" as const, value: entry.school },
    ];
    for (const { kind, value } of sources) {
      const label = value?.trim();
      if (!label) continue;
      const id = `org:${kind}:${label.toLowerCase()}`;
      const bucket = buckets.get(id) ?? { id, kind, label, members: [] };
      bucket.members.push(entry.member);
      buckets.set(id, bucket);
    }
  }
  const orgs = new Map<string, OrgHub>();
  for (const [id, bucket] of buckets) {
    if (bucket.members.length >= 2) orgs.set(id, bucket);
  }
  return orgs;
}

export type PinnedEntry =
  | { type: "person"; person: Person }
  | { type: "org"; org: OrgHub };

// Resolve pin ids (person ids or hub ids) into renderable entries, dropping
// ids that no longer exist.
export function resolvePins(
  pinnedIds: readonly string[],
  people: Person[],
  orgs: Map<string, OrgHub>
): PinnedEntry[] {
  return pinnedIds
    .map((id): PinnedEntry | null => {
      const person = people.find((p) => p.id === id);
      if (person) return { type: "person", person };
      const org = orgs.get(id);
      return org ? { type: "org", org } : null;
    })
    .filter((e) => e !== null);
}
