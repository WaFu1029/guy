import { canonicalOrg } from "@/lib/orgNames";
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
// Names are canonicalized first (see canonicalOrg), so "Columbia University"
// and "Columbia" land in one hub labeled "Columbia".
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

  // Canonicalization can hand back different labels for one key when nobody's
  // spelling is an alias ("Acme Labs" vs "acme labs"), so the spelling used by
  // the most people wins, first-seen breaking ties.
  const buckets = new Map<string, { hub: OrgHub; labelCounts: Map<string, number> }>();
  for (const entry of entries) {
    const sources = [
      { kind: "company" as const, value: entry.company },
      { kind: "school" as const, value: entry.school },
    ];
    for (const { kind, value } of sources) {
      const canonical = value ? canonicalOrg(value, kind) : null;
      if (!canonical) continue;
      const id = `org:${kind}:${canonical.key}`;
      const bucket = buckets.get(id) ?? {
        hub: { id, kind, label: canonical.label, members: [] },
        labelCounts: new Map<string, number>(),
      };
      bucket.hub.members.push(entry.member);
      bucket.labelCounts.set(
        canonical.label,
        (bucket.labelCounts.get(canonical.label) ?? 0) + 1
      );
      buckets.set(id, bucket);
    }
  }
  const orgs = new Map<string, OrgHub>();
  for (const [id, { hub, labelCounts }] of buckets) {
    if (hub.members.length < 2) continue;
    let best = hub.label;
    let bestCount = 0;
    for (const [label, count] of labelCounts) {
      if (count > bestCount) {
        best = label;
        bestCount = count;
      }
    }
    orgs.set(id, { ...hub, label: best });
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
