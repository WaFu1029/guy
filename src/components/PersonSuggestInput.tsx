"use client";

import { useId, useMemo, useRef, useState } from "react";

export type SuggestPerson = {
  name: string;
  role?: string | null;
  company?: string | null;
};

// Split a comma-separated value into its segments plus the caret segment (the
// last one, which is the one being typed).
function csvParts(value: string): { done: string[]; typing: string } {
  const parts = value.split(",");
  return { done: parts.slice(0, -1).map((p) => p.trim()), typing: parts[parts.length - 1] ?? "" };
}

function rank(people: SuggestPerson[], query: string, exclude: Set<string>): SuggestPerson[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { p: SuggestPerson; score: number }[] = [];
  for (const p of people) {
    const name = p.name.toLowerCase();
    if (exclude.has(name)) continue;
    const org = (p.company ?? "").toLowerCase();
    const role = (p.role ?? "").toLowerCase();
    // Name prefix beats a word-start inside the name, which beats a plain
    // substring; company/role matches rank last so "stripe" still finds people.
    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 1;
    else if (name.includes(q)) score = 2;
    else if (org.includes(q) || role.includes(q)) score = 3;
    if (score >= 0) scored.push({ p, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name))
    .slice(0, 6)
    .map((s) => s.p);
}

// Text input that suggests people already in the network as you type.
// `mode="csv"` matches only the segment after the last comma and completes it
// in place, so "Also knows…" keeps working as a comma-separated list.
export function PersonSuggestInput({
  value,
  onChange,
  people,
  mode = "single",
  placeholder,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  people: SuggestPerson[];
  mode?: "single" | "csv";
  placeholder?: string;
  className?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { done, typing } = mode === "csv" ? csvParts(value) : { done: [], typing: value };
  const suggestions = useMemo(() => {
    const exclude = new Set(done.map((d) => d.toLowerCase()));
    const matches = rank(people, typing, exclude);
    // An exact single match the user already typed in full is just noise.
    if (matches.length === 1 && matches[0].name.toLowerCase() === typing.trim().toLowerCase()) {
      return [];
    }
    return matches;
  }, [people, typing, done]);
  const visible = open && suggestions.length > 0;

  const commit = (name: string) => {
    onChange(mode === "csv" ? [...done, name].join(", ") + ", " : name);
    setOpen(false);
    setActive(0);
  };

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        // The dropdown lives outside the input, so closing on blur has to wait
        // for the click on a suggestion to land.
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (!visible) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            commit(suggestions[active].name);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className={className}
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {visible && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700"
        >
          {suggestions.map((p, i) => (
            <li key={p.name} role="option" aria-selected={i === active}>
              <button
                type="button"
                // onMouseDown fires before the input's blur, so the click isn't
                // swallowed by the dropdown closing.
                onMouseDown={(e) => {
                  e.preventDefault();
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  commit(p.name);
                }}
                onMouseEnter={() => setActive(i)}
                className={
                  "flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm " +
                  (i === active
                    ? "bg-neutral-100 dark:bg-neutral-700"
                    : "bg-transparent")
                }
              >
                <span className="font-medium text-neutral-900 dark:text-neutral-50">{p.name}</span>
                {(p.role || p.company) && (
                  <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {[p.role, p.company].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
