import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import type { PersonUpdate } from "@/types/extraction";

const UPDATE_PERSON_TOOL = {
  name: "update_person",
  description:
    "Turn the user's spoken instruction about an existing contact into a structured update. Only include fields the user actually asked to change.",
  input_schema: {
    type: "object" as const,
    properties: {
      note: {
        type: "string",
        description:
          "New note text, if the user wants to add or replace a note. Write it in the user's own words where possible.",
      },
      note_mode: {
        type: "string",
        enum: ["append", "replace"],
        description:
          "How to apply the note: 'append' adds to the existing notes (default), 'replace' overwrites them. Use replace only when the user clearly says to replace/rewrite/clear the notes.",
      },
      role: { type: "string", description: "Updated job title, if the user corrected it." },
      company: { type: "string", description: "Updated company, if the user corrected it." },
      school: { type: "string", description: "School or university to set, if mentioned." },
      met_at: { type: "string", description: "Updated event/place they met, if corrected." },
      how_they_help: {
        type: "string",
        description:
          "The role the user sees this person playing for them, or how they could help — an intro, a hire, a customer, funding, advice. Only when the user says it; do not invent an angle.",
      },
      phone: { type: "string", description: "Phone number to set, verbatim." },
      email: { type: "string", description: "Email address to set, verbatim." },
      instagram: { type: "string", description: "Instagram handle to set, without the leading @." },
      twitter: { type: "string", description: "Twitter/X handle to set, without the leading @." },
      lead_heat: {
        type: "integer",
        minimum: 1,
        maximum: 5,
        description:
          "Updated lead heat, 1 (cold) to 5 (hot), if the user rates them ('he's a five now', 'this one's gone cold'). Omit when unstated.",
      },
      follow_up_hours: {
        type: "number",
        description:
          "Hours from now for a new follow-up reminder, if the user asked for one (e.g. '1 day' -> 24, 'next week' -> 168).",
      },
      follow_up_about: {
        type: "string",
        description: "What the new follow-up is about, as a short imperative phrase.",
      },
      group_name: {
        type: "string",
        description:
          "The group the user asked to move this person into, if they said one. Use the exact name from the user's existing groups list when it matches; a name not on the list is fine too — a new group will be created.",
      },
      also_knows: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "The person's name." },
            relationship: {
              type: "string",
              description:
                "How they know each other, ONLY if the user said. Omit when unstated — do not guess.",
            },
          },
          required: ["name"],
        },
        description:
          "Other people this contact knows, if the user mentioned any. When a mention matches an existing contact — by name or by a relationship reference like \"my mom\" that matches a contact's summary — use that contact's exact name; genuinely new names are fine too (they'll be created).",
      },
    },
  },
};

export async function POST(request: Request) {
  const { transcript, personName, currentNotes, groups, people } = await request.json();

  if (!transcript || typeof transcript !== "string") {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }

  const contextParts: string[] = [];
  if (currentNotes && typeof currentNotes === "string" && currentNotes.trim()) {
    contextParts.push(
      `Current notes on this contact (when appending, the note field must contain ONLY genuinely new information — never restate anything already here):\n"""${currentNotes.trim()}"""`
    );
  }
  if (Array.isArray(groups) && groups.length > 0) {
    contextParts.push(`The user's existing groups: ${groups.join(", ")}`);
  }
  if (Array.isArray(people) && people.length > 0) {
    contextParts.push(
      `The user's existing contacts, one per line as "Name — role · company — notes". When a mention matches one — by name OR by a relationship/description reference like "my mom", "my roommate" that matches a summary — use that contact's exact name:\n${people.join("\n")}`
    );
  }

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    tool_choice: { type: "tool", name: "update_person" },
    tools: [UPDATE_PERSON_TOOL],
    messages: [
      {
        role: "user",
        content: `The user is looking at the profile of a contact named "${personName ?? "unknown"}" and spoke an instruction about what to change. Extract the update. Only include fields the user actually asked to change — never placeholder values. Apply corrections to the right fields ("her name is Eric, not John" changes the name), but never record the instruction wording itself as a note — notes must read like notes about the person, not like a conversation with the app.
${contextParts.length > 0 ? "\n" + contextParts.join("\n") + "\n" : ""}
Instruction: "${transcript}"`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    return NextResponse.json({ error: "Update was declined" }, { status: 422 });
  }

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json({ error: "Couldn't understand the instruction" }, { status: 422 });
  }

  const update = toolUse.input as PersonUpdate;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No change recognized in the instruction" }, { status: 422 });
  }

  return NextResponse.json({ update });
}
