// Instant shell for a person's profile. Tapping a graph node is a dynamic
// navigation like the tabs are, and without this the route would inherit the
// root Network skeleton — a graph-shaped placeholder on a profile page.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-md animate-pulse px-4 pb-8 pt-2">
      <div className="h-3.5 w-20 rounded bg-neutral-200 dark:bg-neutral-800" />

      <div className="mt-3 rounded-3xl bg-neutral-100 px-5 py-6 dark:bg-neutral-900">
        {/* Name */}
        <div className="h-7 w-40 rounded bg-neutral-200 dark:bg-neutral-800" />

        {/* Editable field rows */}
        <div className="mt-4 flex flex-col gap-2">
          {["w-full", "w-5/6", "w-2/3"].map((w) => (
            <div key={w} className={`h-8 rounded-xl ${w} bg-white dark:bg-neutral-800`} />
          ))}
        </div>

        {/* Contact chips */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["w-28", "w-36", "w-24"].map((w) => (
            <div key={w} className={`h-6 rounded-full ${w} bg-white dark:bg-neutral-800`} />
          ))}
        </div>

        {/* Voice-edit row: record button + hint text */}
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-white px-3 py-3 dark:bg-neutral-800">
          <div className="h-12 w-12 shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-700" />
          <div className="h-3 w-40 rounded bg-neutral-200 dark:bg-neutral-700" />
        </div>

        {/* Connections */}
        <div className="mt-4">
          <div className="h-3 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="mt-2 flex flex-col gap-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-9 rounded-xl bg-white dark:bg-neutral-800" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
