"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setOrgColor } from "@/app/orgs/actions";
import { GROUP_COLOR_PRESETS } from "@/lib/groupColors";

// Color for an org hub: the group presets, a custom pick, or none (the
// graph's default hub gray). Applies immediately.
export function OrgColorPicker({ orgKey, color: initial }: { orgKey: string; color: string | null }) {
  const router = useRouter();
  const [color, setColor] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const pick = async (next: string | null) => {
    const previous = color;
    setColor(next);
    setError(null);
    try {
      await setOrgColor(orgKey, next);
      router.refresh();
    } catch (err) {
      setColor(previous);
      setError(err instanceof Error ? err.message : "Failed to save color");
    }
  };

  const swatch = "h-8 w-8 rounded-full transition-transform hover:scale-110";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {GROUP_COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => pick(c)}
            aria-label={`Color ${c}`}
            aria-pressed={color === c}
            className={
              swatch +
              (color === c
                ? " ring-2 ring-neutral-900 ring-offset-2 ring-offset-neutral-100 dark:ring-neutral-100 dark:ring-offset-neutral-900"
                : "")
            }
            style={{ backgroundColor: c }}
          />
        ))}
        {/* Custom color: the native picker, shown as a rainbow swatch. */}
        <label
          className={
            swatch +
            " relative cursor-pointer overflow-hidden" +
            (color && !GROUP_COLOR_PRESETS.includes(color)
              ? " ring-2 ring-neutral-900 ring-offset-2 ring-offset-neutral-100 dark:ring-neutral-100 dark:ring-offset-neutral-900"
              : "")
          }
          style={{
            background:
              color && !GROUP_COLOR_PRESETS.includes(color)
                ? color
                : "conic-gradient(#f87171, #fbbf24, #4ade80, #38bdf8, #c084fc, #f87171)",
          }}
          title="Custom color"
        >
          <input
            type="color"
            value={color ?? "#94a3b8"}
            onChange={(e) => pick(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Custom color"
          />
        </label>
        {color && (
          <button
            type="button"
            onClick={() => pick(null)}
            className="ml-1 rounded-full px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
          >
            Reset
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
