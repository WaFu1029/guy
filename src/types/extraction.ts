import type { RelationshipType } from "@/types/database";

export interface ExtractedConnection {
  name: string;
  role?: string;
  company?: string;
  met_at?: string;
  context?: string;
  relationship_type?: RelationshipType;
  relationship_label?: string;
  follow_up_hours?: number;
}
