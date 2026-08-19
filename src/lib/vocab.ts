import type { VocabTerm } from "@/types/database";

// One prompt line per vocabulary term. Recorded aliases carry most of the
// weight — they're the literal strings this user's recognizer produces, so
// the model is matching text to text rather than guessing at phonetics.
export function vocabLine(
  v: Pick<VocabTerm, "term" | "hint" | "aliases">
): string {
  const parts = [v.term];
  if (v.hint?.trim()) parts.push(`(${v.hint.trim()})`);
  const aliases = (v.aliases ?? []).filter((a) => a.trim());
  if (aliases.length > 0) parts.push(`— commonly transcribed as: ${aliases.join(", ")}`);
  return parts.join(" ");
}

// Normalized comparison so "Bungle" and "bungle " count as the same alias.
export const normalizeAlias = (s: string) => s.trim().toLowerCase().replace(/[.,!?]+$/, "");
