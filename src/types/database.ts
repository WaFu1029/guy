export type RelationshipType = "met_at_event" | "introduced_by" | "works_with" | "other";
export type FollowUpStatus = "pending" | "completed" | "snoozed" | "dismissed";

export type Group = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  description: string | null;
  created_at: string;
};

// The user's own details — one row per auth user, absent until first save.
export type Profile = {
  user_id: string;
  name: string | null;
  // What the user does.
  role: string | null;
  school: string | null;
  company: string | null;
  created_at: string;
  updated_at: string;
};

export type Person = {
  id: string;
  user_id: string;
  group_id: string | null;
  name: string;
  role: string | null;
  company: string | null;
  school: string | null;
  notes: string | null;
  // The role the user sees them playing / how they can help.
  how_they_help: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  twitter: string | null;
  raw_transcript: string | null;
  met_at: string | null;
  // 1 (cold) … 5 (hot); null when unrated.
  lead_heat: number | null;
  met_date: string;
  created_at: string;
  updated_at: string;
};

export type VocabTerm = {
  id: string;
  user_id: string;
  term: string;
  hint: string | null;
  // Mistranscriptions captured from the user's own voice.
  aliases: string[];
  created_at: string;
};

export type Connection = {
  id: string;
  user_id: string;
  from_person_id: string | null;
  to_person_id: string;
  relationship_type: RelationshipType;
  label: string | null;
  created_at: string;
};

export type FollowUp = {
  id: string;
  user_id: string;
  person_id: string;
  due_at: string;
  status: FollowUpStatus;
  notes: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      groups: {
        Row: Group;
        Insert: Partial<Group> & { user_id: string; name: string; color: string };
        Update: Partial<Group>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { user_id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      people: {
        Row: Person;
        Insert: Partial<Person> & { user_id: string; name: string };
        Update: Partial<Person>;
        Relationships: [];
      };
      vocab_terms: {
        Row: VocabTerm;
        Insert: Partial<VocabTerm> & { user_id: string; term: string };
        Update: Partial<VocabTerm>;
        Relationships: [];
      };
      connections: {
        Row: Connection;
        Insert: Partial<Connection> & { user_id: string; to_person_id: string };
        Update: Partial<Connection>;
        Relationships: [
          {
            foreignKeyName: "connections_from_person_id_fkey";
            columns: ["from_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connections_to_person_id_fkey";
            columns: ["to_person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
      follow_ups: {
        Row: FollowUp;
        Insert: Partial<FollowUp> & { user_id: string; person_id: string; due_at: string };
        Update: Partial<FollowUp>;
        Relationships: [
          {
            foreignKeyName: "follow_ups_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
