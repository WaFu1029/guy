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
      people: {
        Row: Person;
        Insert: Partial<Person> & { user_id: string; name: string };
        Update: Partial<Person>;
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
