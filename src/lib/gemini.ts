interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Calls Anthropic's Messages API.
 * File name kept (gemini.ts) so existing imports keep working; the signature is unchanged.
 * Env: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (optional, default claude-sonnet-5-5).
 */
export async function callAI(messages: Message[], maxTokens = 1000): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set on the server. Add it in Vercel → Settings → Environment Variables and redeploy.');
  }
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.4,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Unexpected response from Anthropic API (HTTP ${res.status}): ${raw.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Anthropic API request failed (HTTP ${res.status})`);
  }
  const text = (data?.content ?? []).map((b: any) => (b.type === 'text' ? b.text : '')).join('');
  if (!text.trim()) throw new Error('Anthropic returned an empty response');
  return text;
}

/** Existing imports of callClaude keep working. */
export const callClaude = callAI;
