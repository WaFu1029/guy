import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import type { FollowUpEdit, PersonUpdate } from "@/types/extraction";

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
      name: {
        type: "string",
        description:
          "Corrected name for this person, if the user fixes it ('her name is spelled Fu, F-U, not Foo'). Letters spoken individually are the user repairing a misheard name — assemble them and trust that spelling. Omit unless the name is being corrected.",
      },
      role: { type: "string", description: "Updated job title, if the user corrected it." },
      company: { type: "string", description: "Updated company, if the user corrected it." },
      school: {
        type: "string",
        description:
          "School or university to set, if mentioned. Use the short name people say — 'Columbia', 'UC Berkeley' — not the full legal name.",
      },
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
          "Hours from now for a NEW follow-up reminder, if the user asked for one (e.g. '1 day' -> 24, 'next week' -> 168). Never use this to change an existing follow-up — that's follow_up_edits.",
      },
      follow_up_edits: {
        type: "array",
        description:
          "Changes to the person's EXISTING follow-ups (listed in the context as F1, F2, …) — 'move it to Friday at 3', 'push the follow-up a week', 'change it to: send the deck', 'mark it done', 'cancel the reminder'. When the user says 'the follow-up' and only one exists, it's that one.",
        items: {
          type: "object",
          properties: {
            ref: { type: "string", description: "Which follow-up, e.g. 'F1'." },
            due_at: {
              type: "string",
              description:
                "New due time as ISO 8601 with the same UTC offset as the current time given in the context. Resolve relative phrases ('Friday at 3pm', 'push it a week' — from its current due time) against that. A day with no time keeps the current time of day.",
            },
            notes: {
              type: "string",
              description: "Replacement text for what the follow-up is about, short imperative phrase.",
            },
            action: {
              type: "string",
              enum: ["complete", "dismiss"],
              description: "'complete' when done ('mark it done', 'I already did it'); 'dismiss' to cancel it.",
            },
          },
          required: ["ref"],
        },
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
  const { transcript, personName, currentNotes, groups, people, vocabulary, followUps, now } =
    await request.json();

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
  // Pending follow-ups, numbered F1… so the model can point at one without
  // copying ids. Times arrive already in the user's local time with offset.
  const followUpIds: string[] = [];
  if (Array.isArray(followUps) && followUps.length > 0) {
    const lines = (followUps as { id: string; due: string; notes: string | null }[]).map((f, i) => {
      followUpIds.push(f.id);
      return `F${i + 1}: due ${f.due}${f.notes ? ` — ${f.notes}` : ""}`;
    });
    contextParts.push(`This contact's pending follow-ups:\n${lines.join("\n")}`);
  }
  if (typeof now === "string") {
    contextParts.push(`Current time (the user's timezone): ${now}`);
  }
  if (Array.isArray(vocabulary) && vocabulary.length > 0) {
    contextParts.push(
      `The user's vocabulary — names and terms they say often, spelled the way they want them:\n${vocabulary.join("\n")}\n\nSpeech recognition mangles unusual names. A "commonly transcribed as" list is what this user's recognizer actually produced for that term — treat those strings as certain matches. Beyond those, when a word in the transcript is phonetically close to one of these, it IS that term — use this spelling exactly. Judge by sound, not spelling, and never introduce a term the transcript doesn't sound like.`
    );
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
  // Map F1/F2 refs back to real ids; drop edits that point at nothing.
  if (update.follow_up_edits) {
    update.follow_up_edits = (
      update.follow_up_edits as unknown as ({ ref?: string } & Omit<FollowUpEdit, "id">)[]
    )
      .map(({ ref, ...rest }) => {
        const id = followUpIds[Number(ref?.replace(/\D/g, "")) - 1];
        return id ? { ...rest, id } : null;
      })
      .filter((e): e is FollowUpEdit => e !== null);
    if (update.follow_up_edits.length === 0) delete update.follow_up_edits;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No change recognized in the instruction" }, { status: 422 });
  }

  return NextResponse.json({ update });
}
