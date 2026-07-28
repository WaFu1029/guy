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
      met_at: {
        type: "string",
        description: "The event or location where they met, if mentioned.",
      },
      context: {
        type: "string",
        description:
          "A concise summary of what was discussed or anything else worth remembering for a follow-up. Write this in the user's own words where possible.",
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
    },
    required: ["name"],
  },
};

export async function POST(request: Request) {
  const { transcript } = await request.json();

  if (!transcript || typeof transcript !== "string") {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
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
        content: `Here is a voice note the user recorded right after meeting someone at a networking event. Extract the connection details.\n\nTranscript: "${transcript}"`,
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

  if (!extracted.name) {
    return NextResponse.json({ error: "Could not identify a name in the transcript" }, { status: 422 });
  }

  return NextResponse.json({ extracted });
}
