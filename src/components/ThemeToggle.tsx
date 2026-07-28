"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "guy-theme";

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  // Rendered after mount so the server markup never disagrees with the
  // client-side stored preference.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme((localStorage.getItem(STORAGE_KEY) as Theme) || "system");
  }, []);

  const pick = (next: Theme) => {
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
  };

  return (
    <div className="flex gap-2">
      {(["light", "dark", "system"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => pick(t)}
          className={
            theme === t
              ? "rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium capitalize text-neutral-50 dark:bg-neutral-100 dark:text-neutral-900"
              : "rounded-full bg-white px-4 py-1.5 text-xs capitalize text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
          }
        >
          {t}
        </button>
      ))}
    </div>
  );
}
