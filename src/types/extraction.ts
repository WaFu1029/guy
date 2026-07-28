import type { RelationshipType } from "@/types/database";

// A person this contact knows, with an optional spoken relationship
// ("works with", "sister", "college roommate"). No relationship = blank edge.
export interface KnownPerson {
  name: string;
  relationship?: string;
}

export interface ExtractedConnection {
  name: string;
  role?: string;
  company?: string;
  school?: string;
  met_at?: string;
  context?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  twitter?: string;
  also_knows?: KnownPerson[];
  // Group by name, matched against the user's existing groups client-side.
  group_name?: string;
  // Not AI-extracted — chosen in the log form.
  group_id?: string;
  relationship_type?: RelationshipType;
  relationship_label?: string;
  follow_up_hours?: number;
  follow_up_about?: string;
}

// Patch extracted from a voice command on a person's profile page.
export interface PersonUpdate {
  note?: string;
  note_mode?: "append" | "replace";
  role?: string;
  company?: string;
  school?: string;
  met_at?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  twitter?: string;
  group_name?: string;
  also_knows?: KnownPerson[];
  follow_up_hours?: number;
  follow_up_about?: string;
}
