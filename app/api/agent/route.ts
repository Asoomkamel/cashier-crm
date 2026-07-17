import type { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Optional real-LLM backend for the AI Assistant.
 *
 * - If GEMINI_API_KEY is not set, responds { available: false } and the
 *   client falls back to the local command engine (lib/assistant.ts) —
 *   this is the default, fully working today with zero configuration.
 * - If GEMINI_API_KEY is set, forwards the message + a small JSON summary
 *   of live data to Gemini, asking it to reply with strict JSON matching
 *   { reply: string, action: {...} }, and returns that to the client.
 *
 * This route is intentionally provider-swappable: to use OpenAI or Claude
 * instead, replace the fetch() call below with that provider's API and
 * keep the same request/response shape.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return Response.json({ available: false });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { message, context } = body || {};

    const systemInstructions = `You are an assistant embedded in a POS/CRM system. You must reply with ONLY strict JSON, no markdown, matching this shape:
{"reply": "<short human-readable reply>", "action": {"type": "add_customer"|"add_product"|"add_urgent_order"|"update_order_status"|"none", ...fields}}
Action fields: add_customer needs {name, phone}. add_product needs {name, price}. add_urgent_order needs {phone, issue}. update_order_status needs {requestNumber, status} where status is one of pending/started/in_progress/completed/canceled. Use "none" with no extra fields for questions/answers that don't require a data change.
Here is a summary of current data (for answering questions only, do not repeat it back verbatim): ${JSON.stringify(context).slice(0, 4000)}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${systemInstructions}\n\nUser message: ${message}` }] }],
      }),
    });

    if (!geminiRes.ok) {
      return Response.json({ available: true, error: `Gemini API error (${geminiRes.status})` }, { status: 502 });
    }

    const data = await geminiRes.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let parsed: { reply: string; action: { type: string; [k: string]: any } } | null = null;
    try {
      const cleaned = text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { reply: text || "Sorry, I couldn't process that.", action: { type: "none" } };
    }

    return Response.json({ available: true, ...parsed });
  } catch (err: any) {
    return Response.json({ available: true, error: err?.message || "Unexpected error" }, { status: 500 });
  }
}
