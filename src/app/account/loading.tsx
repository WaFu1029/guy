// Instant shell for the Account tab — one block per card on the real page
// (identity + counts, appearance, groups, contacts, danger zone).

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-neutral-100 px-5 py-5 dark:bg-neutral-900">{children}</div>
  );
}

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-md animate-pulse flex-col gap-3 px-4 pb-8 pt-2">
      <Card>
        <div className="h-3 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="mt-1.5 h-9 w-full rounded-xl bg-white dark:bg-neutral-800" />
        <div className="mt-3 flex gap-3">
          <div className="h-16 flex-1 rounded-xl bg-white dark:bg-neutral-800" />
          <div className="h-16 flex-1 rounded-xl bg-white dark:bg-neutral-800" />
        </div>
      </Card>

      <Card>
        <div className="h-3 w-20 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="mt-2 h-9 w-44 rounded-full bg-white dark:bg-neutral-800" />
      </Card>

      <Card>
        <div className="h-3 w-14 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="mt-2 flex flex-wrap gap-2">
          {["w-20", "w-24", "w-16"].map((w) => (
            <div key={w} className={`h-7 rounded-full ${w} bg-white dark:bg-neutral-800`} />
          ))}
        </div>
      </Card>

      <Card>
        <div className="h-3 w-16 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="mt-2 h-9 w-full rounded-xl bg-white dark:bg-neutral-800" />
        <div className="mt-2 flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-11 rounded-xl bg-white dark:bg-neutral-800" />
          ))}
        </div>
      </Card>

      <Card>
        <div className="h-9 w-32 rounded-full bg-white dark:bg-neutral-800" />
      </Card>
    </div>
  );
}
