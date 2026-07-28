-- Guy MVP schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.
-- Assumes Supabase Auth is enabled (auth.users already exists).

create extension if not exists "pgcrypto";

-- People the user has met. Each row is a graph node.
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role text,
  company text,
  notes text,
  raw_transcript text,
  met_at text,
  met_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists people_user_id_idx on people(user_id);

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

drop trigger if exists people_set_updated_at on people;
create trigger people_set_updated_at
  before update on people
  for each row execute function set_updated_at();

-- Row Level Security: every row is scoped to its owning user.
alter table people enable row level security;
alter table connections enable row level security;
alter table follow_ups enable row level security;

drop policy if exists "people owner access" on people;
create policy "people owner access" on people
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "connections owner access" on connections;
create policy "connections owner access" on connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "follow_ups owner access" on follow_ups;
create policy "follow_ups owner access" on follow_ups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
