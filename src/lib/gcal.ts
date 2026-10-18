// Google Calendar's "new event" template link. Opens Calendar with the event
// pre-filled; the user saves it there — no OAuth, no access to their account.
// https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=…

const FOLLOW_UP_MINUTES = 30;

// 2026-10-18T20:40:00.000Z → 20261018T204000Z, the format `dates` expects.
const gcalStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function followUpCalendarUrl({
  personId,
  personName,
  dueAt,
  notes,
}: {
  personId: string;
  personName: string;
  dueAt: string;
  notes: string | null;
}): string {
  const start = new Date(dueAt);
  const end = new Date(start.getTime() + FOLLOW_UP_MINUTES * 60 * 1000);
  // Called from a click handler, so window is always there.
  const profile = `${window.location.origin}/people/${personId}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Follow up with ${personName}`,
    dates: `${gcalStamp(start)}/${gcalStamp(end)}`,
    details: [notes?.trim(), `Profile in Guy: ${profile}`].filter(Boolean).join("\n\n"),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
