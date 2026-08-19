// Instant shell for the Log tab — mirrors LogForm's card so the real form
// swaps in without the layout jumping.

function Field({ labelWidth }: { labelWidth: string }) {
  return (
    <div>
      <div className={`h-3 rounded ${labelWidth} bg-neutral-200 dark:bg-neutral-800`} />
      <div className="mt-1.5 h-9 w-full rounded-xl bg-white dark:bg-neutral-800" />
    </div>
  );
}

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-6 pt-2">
      <div className="flex flex-1 animate-pulse flex-col rounded-3xl bg-neutral-100 px-5 py-6 dark:bg-neutral-900">
        <div className="flex flex-col gap-4">
          <Field labelWidth="w-12" />
          <Field labelWidth="w-28" />

          {/* The two half-width rows: also knows / met because, school / company. */}
          {[0, 1].map((i) => (
            <div key={i} className="grid grid-cols-2 gap-3">
              <Field labelWidth="w-20" />
              <Field labelWidth="w-24" />
            </div>
          ))}

          {/* Contact: one label over a 2x2 grid of handles. */}
          <div>
            <div className="h-3 w-16 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-9 rounded-xl bg-white dark:bg-neutral-800" />
              ))}
            </div>
          </div>

          {/* Group and Follow up: a label over a row of pill buttons. */}
          {[
            { label: "w-14", pills: ["w-20", "w-16", "w-14"] },
            { label: "w-20", pills: ["w-14", "w-16", "w-16", "w-16"] },
          ].map((row, rowIndex) => (
            // Index keys: fixed-length skeleton lists that never reorder, and
            // the widths repeat so they aren't unique.
            <div key={rowIndex}>
              <div className={`h-3 rounded ${row.label} bg-neutral-200 dark:bg-neutral-800`} />
              <div className="mt-2 flex flex-wrap gap-2">
                {row.pills.map((w, i) => (
                  <div key={i} className={`h-7 rounded-full ${w} bg-white dark:bg-neutral-800`} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Record circle + Save, docked to the bottom like the real form. */}
        <div className="mt-auto flex flex-col items-center gap-3 pt-6">
          <div className="h-20 w-20 rounded-full bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-10 w-24 rounded-full bg-neutral-200 dark:bg-neutral-800" />
        </div>
      </div>
    </div>
  );
}
