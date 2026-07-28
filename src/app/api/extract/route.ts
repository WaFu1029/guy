import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import type { ExtractedConnection } from "@/types/extraction";

const RECORD_CONNECTION_TOOL = {
  name: "record_connection",
  description:
    "Record structured details about a person the user just met, extracted from a spoken voice note.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "The person's name, as best identified from the transcript.",
      },
      role: {
        type: "string",
        description: "Their job title or role, if mentioned.",
      },
      company: {
        type: "string",
        description: "Their company or organization, if mentioned.",
      },
      school: {
        type: "string",
        description:
          "The school or university they attend (or attended), if mentioned. Set this for grouping — but ALSO work the fact into context, since school is part of what they do.",
      },
      met_at: {
        type: "string",
        description:
          "How or why the user knows this person — the event, place, or origin of the relationship (e.g. 'SF demo day', 'high school', 'introduced by Maya'). Any 'I know her from X' statement belongs here.",
      },
      context: {
        type: "string",
        description:
          "What this person does and what was discussed — anything worth remembering for a follow-up, including where they study or work (e.g. 'Goes to UC Berkeley'). Write it in the user's own words where possible. Do NOT put how they met here; that belongs in met_at.",
      },
      phone: {
        type: "string",
        description: "Their phone number, if mentioned, verbatim.",
      },
      email: {
        type: "string",
        description: "Their email address, if mentioned, verbatim.",
      },
      instagram: {
        type: "string",
        description:
          "Their Instagram handle, if mentioned, without the leading @.",
      },
      twitter: {
        type: "string",
        description:
          "Their Twitter/X handle, if mentioned, without the leading @.",
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
                "How they know each other, ONLY if the user said (e.g. 'works with', 'sister', 'college roommate'). Omit when unstated — do not guess.",
            },
          },
          required: ["name"],
        },
        description:
          "Other people this person knows, mentioned in the transcript. Excluding the user. When a mention matches an existing contact — by name or by a relationship reference like \"my mom\" that matches a contact's summary — use that contact's exact name.",
      },
      group_name: {
        type: "string",
        description:
          "The group the user asked to put this person in, if they said one. Use the exact name from the user's existing groups list when it matches; a name not on the list is fine too — a new group will be created.",
      },
      relationship_type: {
        type: "string",
        enum: ["met_at_event", "introduced_by", "works_with", "other"],
        description:
          "How this connection maps onto the user's network. Default to met_at_event unless the transcript clearly says someone else introduced them or that they work together.",
      },
      relationship_label: {
        type: "string",
        description:
          "A short freeform label for the relationship_type, e.g. the event name, or who introduced them.",
      },
      follow_up_hours: {
        type: "number",
        description:
          "Hours from now until the user wants to follow up, if they stated one (e.g. '12 hours' -> 12, '1 day' -> 24, '2 days' -> 48, 'next week' -> 168). Omit if the user didn't mention a follow-up timeframe.",
      },
      follow_up_about: {
        type: "string",
        description:
          "What the user wants the follow-up to be about, if they said (e.g. 'send them the deck', 'intro to Sofia'). Short imperative phrase.",
      },
    },
    required: ["name"],
  },
};

export async function POST(request: Request) {
  const { transcript, draft, groups, people } = await request.json();

  if (!transcript || typeof transcript !== "string") {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }

  // Optional context so follow-up recordings and references to existing data
  // resolve correctly instead of overwriting or inventing.
  const contextParts: string[] = [];
  if (draft && typeof draft === "object" && Object.keys(draft).length > 0) {
    contextParts.push(
      `The user already has a partially filled draft for this person (they may be adding to or correcting it — resolve pronouns like "he"/"her" to this person, and repeat the draft's name as the name if the transcript doesn't restate it):\n${JSON.stringify(draft)}`
    );
  }
  if (Array.isArray(groups) && groups.length > 0) {
    contextParts.push(`The user's existing groups: ${groups.join(", ")}`);
  }
  if (Array.isArray(people) && people.length > 0) {
    contextParts.push(
      `The user's existing contacts, one per line as "Name — role · company — notes". When a mention matches one — by name OR by a relationship/description reference like "my mom", "my roommate", "the Stripe PM" that matches a summary — use that contact's exact name:\n${people.join("\n")}`
    );
  }

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    tool_choice: { type: "tool", name: "record_connection" },
    tools: [RECORD_CONNECTION_TOOL],
    messages: [
      {
        role: "user",
        content: `Here is a voice note the user recorded right after meeting someone at a networking event. Extract the connection details.

Only include fields the transcript (or draft) actually supports. Never output placeholder values like "<UNKNOWN>" or "N/A" — omit the field instead. If the draft already has notes, the context field must contain ONLY new information not present in them — never restate what the draft already says.

The transcript may mix two kinds of speech: facts about the person, and instructions aimed at this app ("name is Eric Zhang, not John", "actually put him under Family", "no wait, scratch that"). APPLY instructions to the right fields — a name correction changes the name field — but never record the instruction itself as content. Notes must read like notes about the person, not like a conversation with the app.

Never record the ABSENCE of information ("no phone number yet", "didn't catch her email", "don't know where he works") anywhere — a missing fact means the field is simply omitted, not narrated in the notes.
${contextParts.length > 0 ? "\n" + contextParts.join("\n\n") + "\n" : ""}
Transcript: "${transcript}"`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    return NextResponse.json({ error: "Extraction was declined" }, { status: 422 });
  }

  const toolUse = response.content.find((block) => block.type === "tool_use");

  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json({ error: "No structured data extracted" }, { status: 422 });
  }

  const extracted = toolUse.input as ExtractedConnection;

  // Placeholder scrub — a forced tool call sometimes fabricates one anyway.
  if (extracted.name && /unknown|n\/a/i.test(extracted.name)) {
    extracted.name = "";
  }
  if (!extracted.name && !(draft && typeof draft === "object" && (draft as { name?: string }).name)) {
    return NextResponse.json({ error: "Could not identify a name in the transcript" }, { status: 422 });
  }

  return NextResponse.json({ extracted });
}
