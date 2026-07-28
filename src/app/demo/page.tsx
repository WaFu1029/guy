import { ConnectionGraph } from "@/components/ConnectionGraph";
import type { Person, Connection } from "@/types/database";

// Credential-free preview of the connection graph — mock data, no auth, no
// Supabase. Useful for checking the mobile layout before the backend is wired.

const now = new Date().toISOString();
const today = now.slice(0, 10);

function person(id: string, name: string, role: string | null, company: string | null): Person {
  return {
    id,
    user_id: "demo",
    group_id: null,
    name,
    role,
    company,
    school: null,
    notes: null,
    phone: null,
    email: null,
    instagram: null,
    twitter: null,
    raw_transcript: null,
    met_at: "Demo Summit",
    met_date: today,
    created_at: now,
    updated_at: now,
  };
}

function connection(
  id: string,
  from: string | null,
  to: string,
  type: Connection["relationship_type"],
  label: string | null
): Connection {
  return {
    id,
    user_id: "demo",
    from_person_id: from,
    to_person_id: to,
    relationship_type: type,
    label,
    created_at: now,
  };
}

const people: Person[] = [
  person("p1", "Maya Chen", "Founder", "Loopwork"),
  person("p2", "Dev Patel", "ML Engineer", "Anthropic"),
  person("p3", "Sofia Reyes", "Designer", "Freelance"),
  person("p4", "Jonah Kim", "VC", "Ridgeline"),
  person("p5", "Amara Okafor", "PM", "Stripe"),
  person("p6", "Leo Martins", "Student", "Berkeley"),
];

const connections: Connection[] = [
  connection("c1", null, "p1", "met_at_event", "demo day"),
  connection("c2", null, "p2", "met_at_event", "hackathon"),
  connection("c3", null, "p3", "met_at_event", null),
  connection("c4", "p1", "p4", "introduced_by", "intro'd me"),
  connection("c5", "p2", "p5", "works_with", null),
  connection("c6", null, "p6", "met_at_event", "coffee chat"),
  connection("c7", "p1", "p3", "works_with", "contract work"),
];

export default function DemoPage() {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col gap-3 px-4 pb-4 pt-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">Network.</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Mock network — no account or database needed.</p>
      </div>
      <div className="min-h-0 flex-1">
        <ConnectionGraph people={people} connections={connections} />
      </div>
    </div>
  );
}
