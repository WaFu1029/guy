const pad = (n: number) => String(n).padStart(2, "0");

// ISO timestamp → "2026-10-18T20:40" in the viewer's timezone, the value a
// <input type="datetime-local"> expects.
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// A moment as local ISO 8601 with its UTC offset — "2026-10-18T09:50:00-07:00".
// Handed to the model so "Friday at 3pm" resolves in the user's timezone.
export function toLocalIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${toLocalInput(d.toISOString())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
