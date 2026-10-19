import { makeSession, refine, InputError } from './agent.js';
import { makeQloo } from './qloo.js';
import { askJSON } from './llm.js';

const CACHE_SECONDS = 3600;

export default {
  async fetch(request, env, execCtx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/api/health') {
      return json({ ok: true, qloo: !!env.QLOO_API_KEY, ai: !!env.AI }, 200, cors);
    }
    if (request.method !== 'POST' || !['/api/session', '/api/refine'].includes(url.pathname)) {
      return json({ error: 'Not found' }, 404, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Please send JSON.' }, 400, cors);
    }

    const cacheKey = new Request(`https://cache.remembering-room/${url.pathname}/${await hash(body)}`);
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) return withHeaders(hit, cors);
    }

    const ctx = deps(env);
    try {
      const card =
        url.pathname === '/api/session'
          ? await makeSession(ctx, body.profile || body)
          : await refine(ctx, body.profile, body.card, body.feedback);
      const res = json({ card, trace: ctx.trace }, 200, { 'cache-control': `max-age=${CACHE_SECONDS}` });
      if (cache) execCtx?.waitUntil?.(cache.put(cacheKey, res.clone()));
      return withHeaders(res, cors);
    } catch (err) {
      if (err instanceof InputError) return json({ error: err.message }, 400, cors);
      console.error(err?.stack || err);
      const message = err?.qloo
        ? "We couldn't reach our music and film library. Please try again in a minute."
        : 'Something went wrong on our side. Please try again.';
      return json({ error: message }, 502, cors);
    }
  },
};

export function deps(env) {
  return {
    qloo: makeQloo(env),
    ask: (system, user, fallback, opts) => askJSON(env, system, user, fallback, opts),
    trace: [],
  };
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'access-control-allow-origin': ok ? origin || '*' : allowed[0],
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'origin',
  };
}

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

function withHeaders(res, headers) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

async function hash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
