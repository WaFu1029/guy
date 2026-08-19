import type { Person } from "@/types/database";

// A derived org hub: synthesized at render time when ≥2 people share a
// company or school (case-insensitive). Never stored.
export type OrgHub = {
  id: string;
  kind: "company" | "school";
  label: string;
  members: Person[];
};

// Bucket people by company and by school, keep buckets with ≥2 members.
// Shared by the graph (which renders hub nodes) and by anything that needs to
// resolve a pinned hub id back into its members.
export function deriveOrgHubs(people: Person[]): Map<string, OrgHub> {
  const buckets = new Map<string, OrgHub>();
  for (const p of people) {
    const sources = [
      { kind: "company" as const, value: p.company },
      { kind: "school" as const, value: p.school },
    ];
    for (const { kind, value } of sources) {
      const label = value?.trim();
      if (!label) continue;
      const id = `org:${kind}:${label.toLowerCase()}`;
      const bucket = buckets.get(id) ?? { id, kind, label, members: [] };
      bucket.members.push(p);
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
