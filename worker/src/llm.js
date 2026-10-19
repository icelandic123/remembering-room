export const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// Ask the model for JSON. Any failure (no binding, quota, bad JSON) returns
// `fallback`, so the helper keeps working without the model.
export async function askJSON(env, system, user, fallback, { maxTokens = 1200 } = {}) {
  if (!env.AI) return fallback;
  try {
    const out = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: system + '\nReply with one JSON object only. No prose, no code fences.' },
        { role: 'user', content: typeof user === 'string' ? user : JSON.stringify(user) },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
    });
    const text = typeof out?.response === 'string' ? out.response : JSON.stringify(out?.response ?? '');
    return extractJSON(text) ?? fallback;
  } catch {
    return fallback;
  }
}

export function extractJSON(text) {
  if (text && typeof text === 'object') return text;
  const start = text.indexOf('{');
  if (start < 0) return null;
  // Walk forward to the matching closing brace, respecting strings.
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
