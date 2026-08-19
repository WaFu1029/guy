-- Guy MVP schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.
-- Assumes Supabase Auth is enabled (auth.users already exists).

create extension if not exists "pgcrypto";

-- User-defined colored groups for organizing people.
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists groups_user_id_idx on groups(user_id);

-- The user's own details. One row per auth user, created on first save.
-- Powers the "You" node in the graph: the name it renders under, and the
-- school/company that let You join an org hub alongside the people you met.
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text,
  -- What the user does — mirrors people.role.
  role text,
  school text,
  company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- People the user has met. Each row is a graph node.
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid references groups(id) on delete set null,
  name text not null,
  role text,
  company text,
  school text,
  notes text,
  -- The role the user sees this person playing for them — intro, hire,
  -- customer, advice. Free text, entered or spoken at capture time.
  how_they_help text,
  phone text,
  email text,
  instagram text,
  twitter text,
  raw_transcript text,
  met_at text,
  -- How hot the lead is, 1 (cold) to 5 (hot). Null = unrated.
  lead_heat smallint check (lead_heat between 1 and 5),
  met_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists people_user_id_idx on people(user_id);

-- Names and terms the user says often, spelled the way they want them.
-- Speech recognition mangles unusual names ("Bangle" -> "bungle"), so these
-- are handed to the extractor as the canonical spellings to snap to.
create table if not exists vocab_terms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  term text not null,
  -- Optional disambiguator, e.g. "sounds like BANG-gul".
  hint text,
  -- What speech recognition actually turns this term into on the user's
  -- voice and mic ("bungle", "Bangalore"). Captured by recording the term
  -- a few times; a far stronger signal than a phonetic hint.
  aliases text[] not null default (array[]::text[]),
  created_at timestamptz not null default now()
);

create index if not exists vocab_terms_user_id_idx on vocab_terms(user_id);

-- Relationships between people (or between the user and a person, when
-- from_person_id is null). Each row is a graph edge.
create table if not exists connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_person_id uuid references people(id) on delete cascade,
  to_person_id uuid not null references people(id) on delete cascade,
  relationship_type text not null default 'met_at_event'
    check (relationship_type in ('met_at_event', 'introduced_by', 'works_with', 'other')),
  label text,
  created_at timestamptz not null default now()
);

create index if not exists connections_user_id_idx on connections(user_id);
create index if not exists connections_to_person_id_idx on connections(to_person_id);

-- Scheduled follow-up reminders, one per person per capture.
create table if not exists follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'snoozed', 'dismissed')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists follow_ups_user_id_idx on follow_ups(user_id);
create index if not exists follow_ups_due_at_idx on follow_ups(due_at);

-- Keep updated_at current on people.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

drop trigger if exists people_set_updated_at on people;
create trigger people_set_updated_at
  before update on people
  for each row execute function set_updated_at();

-- Row Level Security: every row is scoped to its owning user.
alter table profiles enable row level security;
alter table groups enable row level security;
alter table people enable row level security;
alter table connections enable row level security;
alter table follow_ups enable row level security;
alter table vocab_terms enable row level security;

drop policy if exists "profiles owner access" on profiles;
create policy "profiles owner access" on profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "groups owner access" on groups;
create policy "groups owner access" on groups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "people owner access" on people;
create policy "people owner access" on people
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "connections owner access" on connections;
create policy "connections owner access" on connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "vocab_terms owner access" on vocab_terms;
create policy "vocab_terms owner access" on vocab_terms
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "follow_ups owner access" on follow_ups;
create policy "follow_ups owner access" on follow_ups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Migration for databases created before the contact platform fields existed:
--   alter table people add column if not exists phone text;
--   alter table people add column if not exists email text;
--   alter table people add column if not exists instagram text;
--   alter table people drop column if exists contact;
-- Migration for databases created before groups existed:
--   (run the groups create table + RLS block above, then)
--   alter table people add column if not exists group_id uuid references groups(id) on delete set null;
--   alter table groups add column if not exists description text;
--   alter table people add column if not exists twitter text;
--   alter table people add column if not exists school text;
-- Migration for databases created before "how they can help" existed:
--   alter table people add column if not exists how_they_help text;
-- Migration for databases created before lead heat existed:
--   alter table people add column if not exists lead_heat smallint
--     check (lead_heat between 1 and 5);
-- Migration for databases created before the vocabulary existed:
--   (run the vocab_terms create table + index + RLS block above)
-- Migration for databases created before the user's own profile existed:
--   (run the profiles create table + RLS + updated_at trigger blocks above)
-- Migration for vocabularies created before recorded aliases existed:
--   alter table vocab_terms add column if not exists aliases text[]
--     not null default (array[]::text[]);
