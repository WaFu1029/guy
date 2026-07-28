// Seed the demo network into a real account.
// Usage: node scripts/seed-demo.mjs [email]
//
// Reads .env.local and works with either credential:
//   - SUPABASE_SERVICE_ROLE_KEY (eyJ... JWT) -> supabase-js with RLS bypass
//   - an sbp_... personal access token (any SUPABASE_* var) -> Management API SQL
//
// Also ensures the people.contact column exists.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.local");
  process.exit(1);
}
const projectRef = new URL(url).hostname.split(".")[0];
const email = process.argv[2] ?? "warren.jc.fu@gmail.com";

// Gather candidate credentials from any SUPABASE_* var (not the anon key).
const candidates = Object.entries(env).filter(
  ([k]) => k.startsWith("SUPABASE") && k !== "NEXT_PUBLIC_SUPABASE_ANON_KEY"
);
const pat = candidates.map(([, v]) => v).find((v) => v.startsWith("sbp_"));
const serviceKey = candidates.map(([, v]) => v).find((v) => v.startsWith("eyJ"));

// [name, color]
const GROUPS = [
  ["Founders", "#f87171"],
  ["Builders", "#4ade80"],
  ["Investors", "#38bdf8"],
];
// person index -> group index (null = ungrouped)
const GROUP_OF = [0, 1, 0, 2, 1, 1, 1];

// [name, role, company, notes, met_at, phone, email, instagram, twitter, school]
const PEOPLE = [
  ["Maya Chen", "Founder", "Loopwork", "Met at demo day — building async standup tools, wants an intro to a designer.", "SF Demo Day", "415-555-0132", "maya@loopwork.io", "mayabuilds", "mayabuilds", null],
  ["Dev Patel", "ML Engineer", "Anthropic", "Talked about eval tooling at the hackathon. Big on interpretability.", "AI Hackathon", null, null, "devpatel.ml", "devpatel_ml", null],
  ["Sofia Reyes", "Designer", "Freelance", "Portfolio full of fintech work. Open to contract projects.", "SF Demo Day", null, "sofia.design@gmail.com", "sofiareyes.design", null, null],
  ["Jonah Kim", "VC", "Ridgeline", "Intro'd by Maya. Writes pre-seed checks, likes dev tools.", "Coffee after demo day", "650-555-0177", "jonah@ridgeline.vc", null, "jonahwrites", null],
  ["Amara Okafor", "PM", "Stripe", "Works with Dev on a side project. Knows the payments space cold.", "AI Hackathon", null, null, null, null, null],
  ["Leo Martins", "Student", null, "CS senior, looking for internships. Sharp on graph algorithms.", "Campus coffee chat", "510-555-0164", "leo.martins@berkeley.edu", "leomartins", null, "UC Berkeley"],
  ["Priya Nair", "Engineer", "Stripe", "Met at the payments meetup. Works on billing infra with Amara.", "Payments Meetup", null, "priya.nair@gmail.com", null, "priyaships", "UC Berkeley"],
];

// [from index | null=you, to index, type, label]
const EDGES = [
  [null, 0, "met_at_event", "demo day"],
  [null, 1, "met_at_event", "hackathon"],
  [null, 2, "met_at_event", "demo day"],
  [0, 3, "introduced_by", "intro'd me"],
  [1, 4, "works_with", "side project"],
  [null, 5, "met_at_event", "coffee chat"],
  [null, 6, "met_at_event", "payments meetup"],
  [0, 2, "other", "knows"],
];

if (pat) {
  await seedViaManagementApi(pat);
} else if (serviceKey) {
  await seedViaServiceRole(serviceKey);
} else {
  console.error(
    "No usable credential found. Add SUPABASE_SERVICE_ROLE_KEY (eyJ...) or an sbp_... access token to .env.local"
  );
  process.exit(1);
}

async function seedViaManagementApi(token) {
  const q = (s) => s.replaceAll("'", "''");
  const opt = (v) => (v ? `'${q(v)}'` : "null");
  const personRows = PEOPLE.map(
    ([name, role, company, notes, met, phone, email, instagram, twitter, school], i) =>
      `insert into people (user_id, group_id, name, role, company, notes, met_at, phone, email, instagram, twitter, school)
       values (uid, ${GROUP_OF[i] === null ? "null" : `gid${GROUP_OF[i]}`}, '${q(name)}', ${opt(role)}, ${opt(company)}, '${q(notes)}', '${q(met)}', ${opt(phone)}, ${opt(email)}, ${opt(instagram)}, ${opt(twitter)}, ${opt(school)})
       returning id into pid${i};`
  ).join("\n");
  const edgeRows = EDGES.map(
    ([from, to, type, label]) =>
      `insert into connections (user_id, from_person_id, to_person_id, relationship_type, label)
       values (uid, ${from === null ? "null" : `pid${from}`}, pid${to}, '${type}', '${q(label)}');`
  ).join("\n");

  const groupRows = GROUPS.map(
    ([name, color], i) =>
      `insert into groups (user_id, name, color) values (uid, '${q(name)}', '${color}') returning id into gid${i};`
  ).join("\n");

  const sql = `
alter table people add column if not exists phone text;
alter table people add column if not exists email text;
alter table people add column if not exists instagram text;
alter table people drop column if exists contact;

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  created_at timestamptz not null default now()
);
create index if not exists groups_user_id_idx on groups(user_id);
alter table groups enable row level security;
drop policy if exists "groups owner access" on groups;
create policy "groups owner access" on groups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter table people add column if not exists group_id uuid references groups(id) on delete set null;

do $$
declare
  uid uuid;
  ${PEOPLE.map((_, i) => `pid${i} uuid;`).join("\n  ")}
  ${GROUPS.map((_, i) => `gid${i} uuid;`).join("\n  ")}
begin
  select id into uid from auth.users where lower(email) = lower('${q(email)}');
  if uid is null then
    raise exception 'No auth user with email %', '${q(email)}';
  end if;

  delete from connections where user_id = uid;
  delete from follow_ups where user_id = uid;
  delete from people where user_id = uid;
  delete from groups where user_id = uid;

  ${groupRows}

  ${personRows}

  ${edgeRows}

  insert into follow_ups (user_id, person_id, due_at, notes) values
    (uid, pid3, now() - interval '2 hours', 'Send deck to Jonah'),
    (uid, pid0, now() + interval '48 hours', 'Intro Maya to Sofia');
end $$;
`;

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    console.error(`Management API error ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  console.log(
    `Seeded ${PEOPLE.length} people, ${EDGES.length} connections, 2 follow-ups for ${email} (via Management API).`
  );
}

async function seedViaServiceRole(key) {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let user = null;
  for (let page = 1; page <= 10 && !user; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
    if (data.users.length < 100) break;
  }
  if (!user) {
    console.error(`No auth user found with email ${email} — sign up in the app first.`);
    process.exit(1);
  }
  const uid = user.id;

  await supabase.from("connections").delete().eq("user_id", uid);
  await supabase.from("follow_ups").delete().eq("user_id", uid);
  await supabase.from("people").delete().eq("user_id", uid);

  const { data: inserted, error: peopleError } = await supabase
    .from("people")
    .insert(
      PEOPLE.map(([name, role, company, notes, met_at, phone, email, instagram, twitter, school]) => ({
        user_id: uid,
        name,
        role,
        company,
        notes,
        met_at,
        phone,
        email,
        instagram,
        twitter,
        school,
      }))
    )
    .select("id, name");
  if (peopleError) throw peopleError;
  const idByIndex = PEOPLE.map(([name]) => inserted.find((p) => p.name === name).id);

  const { error: connError } = await supabase.from("connections").insert(
    EDGES.map(([from, to, relationship_type, label]) => ({
      user_id: uid,
      from_person_id: from === null ? null : idByIndex[from],
      to_person_id: idByIndex[to],
      relationship_type,
      label,
    }))
  );
  if (connError) throw connError;

  const { error: fuError } = await supabase.from("follow_ups").insert([
    {
      user_id: uid,
      person_id: idByIndex[3],
      due_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
      notes: "Send deck to Jonah",
    },
    {
      user_id: uid,
      person_id: idByIndex[0],
      due_at: new Date(Date.now() + 48 * 3600_000).toISOString(),
      notes: "Intro Maya to Sofia",
    },
  ]);
  if (fuError) throw fuError;

  console.log(
    `Seeded ${PEOPLE.length} people, ${EDGES.length} connections, 2 follow-ups for ${email} (${uid}).`
  );
}
