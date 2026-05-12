import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { TriageMessagesBody } from "@workspace/api-zod";

const router = Router();

router.post("/triage", async (req, res) => {
  const parsed = TriageMessagesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { messages } = parsed.data;

  const systemPrompt = `You are a sales lead triage assistant. For each inbound message, classify it and return a JSON array.

For each message return an object with:
- "message": the original message text
- "leadCategory": one of "Hot Lead", "Warm Lead", "Cold Lead", "Support Request", "Partnership Inquiry", "Spam", "Unqualified"
- "urgency": one of "high", "medium", "low"
- "nextAction": a concise 1-sentence suggested next action for the sales rep
- "draftReply": a short, warm, professional draft reply the human can send as-is or edit

Return ONLY a JSON object: { "results": [...] }
No markdown fences, no explanation.`;

  const userContent = messages
    .map((msg, i) => `Message ${i + 1}: ${msg}`)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 4096,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";

  let parsed2: { results: unknown[] };
  try {
    parsed2 = JSON.parse(raw);
  } catch {
    req.log.error({ raw }, "Failed to parse OpenAI response as JSON");
    res.status(500).json({ error: "Failed to parse AI response" });
    return;
  }

  res.json(parsed2);
});

export default router;
