interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Calls Google's Gemini API.
 *
 * Kept deliberately compatible with the previous Claude client's signature so every existing
 * call site (insights, crisp-summary, chat, startup routes) works unchanged.
 *
 * Gemini differences handled here:
 *  - roles are 'user' / 'model' (not 'assistant')
 *  - message content is { parts: [{ text }] } rather than a plain string
 *  - the API key goes in a header, not the body
 */
export async function callAI(messages: Message[], maxTokens = 1000): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set on the server. Create a free key at aistudio.google.com/apikey, then add it in your hosting provider's environment variables."
    );
  }

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.4, // lower = more consistent/factual, appropriate for financial commentary
        },
      }),
    }
  );

  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Unexpected response from Gemini API (HTTP ${res.status}): ${raw.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Gemini API request failed (HTTP ${res.status})`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
  if (!text.trim()) {
    // Gemini blocks responses for safety/recitation reasons without returning an HTTP error,
    // so surface that rather than silently returning an empty summary.
    const reason = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason;
    throw new Error(reason ? `Gemini returned no text (reason: ${reason})` : 'Gemini returned an empty response');
  }
  return text;
}

/** Backwards-compatible alias — existing imports of callClaude keep working. */
export const callClaude = callAI;
