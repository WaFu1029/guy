// Fixed preset palette for groups — vivid tones that pop against the light
// graph card while keeping dark initials readable. New groups auto-assign the
// next unused tone; wraps past 10.
export const GROUP_COLOR_PRESETS = [
  "#f87171", // Red
  "#fb923c", // Orange
  "#fbbf24", // Amber
  "#4ade80", // Green
  "#2dd4bf", // Teal
  "#38bdf8", // Sky
  "#818cf8", // Indigo
  "#c084fc", // Purple
  "#f472b6", // Pink
  "#94a3b8", // Slate
];

export function presetColorForIndex(index: number): string {
  const len = GROUP_COLOR_PRESETS.length;
  return GROUP_COLOR_PRESETS[((index % len) + len) % len];
}
