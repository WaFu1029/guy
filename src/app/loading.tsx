// Instant shell for the Network tab.
//
// Every tab reads cookies through the Supabase server client, which makes all
// of them dynamic routes. Without a loading boundary Next prefetches nothing
// and caches nothing, so a tab tap blocked on the whole server round trip with
// the previous tab still frozen on screen. This renders immediately and the
// real page streams in behind it.
//
// This is also the fallback for any nested route without its own loading file,
// so segments that don't look like the graph (log, account, people/[id]) ship
// their own.
export default function Loading() {
  return (
    <div className="mx-auto flex h-[calc(100dvh-3.75rem)] w-full max-w-md animate-pulse flex-col gap-3 px-4 pb-4 pt-2">
      <div className="min-h-0 flex-1 rounded-3xl bg-neutral-100 dark:bg-neutral-900" />
      {/* Matches the collapsed FollowUpBar (px-5 py-4 around one text-sm line). */}
      <div className="h-[3.25rem] shrink-0 rounded-3xl bg-neutral-900" />
    </div>
  );
}
