# Guy — "I know a Guy"

MVP: log the people you meet at networking events by voice, and get reminded to follow up.

## Stack

Next.js (App Router) + Tailwind on Vercel, Supabase (Postgres + Auth), Anthropic Claude API for voice-transcript extraction, `@xyflow/react` for the connection graph.

## Setup

1. Create a Supabase project. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor to create the `people`, `connections`, and `follow_ups` tables with row-level security.
2. Copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from your Supabase project's API settings.
   - `ANTHROPIC_API_KEY` — from the Anthropic Console.
3. `npm install`
4. `npm run dev`

Voice capture uses the browser's Web Speech API (Chrome recommended) — no extra setup needed. Sign up for an account at `/login`, then start logging connections at `/capture`.

## Known MVP limitations

- Reminders only surface in-app when the page loads (no push notifications when the tab is closed).
- Single encounter per person — there's no way yet to log a second interaction with someone already in your network.
- No handling for third-party data privacy/consent beyond standard per-user row-level security.
