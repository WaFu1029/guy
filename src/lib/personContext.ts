// One line per contact for the AI extraction context — enough that references
// like "my mom" or "the Stripe PM" resolve to the right person.
export function personContextLine(p: {
  name: string;
  role: string | null;
  company: string | null;
  notes: string | null;
}): string {
  const bits = [p.name];
  const sub = [p.role, p.company].filter(Boolean).join(" · ");
  if (sub) bits.push(sub);
  if (p.notes) bits.push(p.notes.replace(/\s+/g, " ").slice(0, 100));
  return bits.join(" — ");
}
