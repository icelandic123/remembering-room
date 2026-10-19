const BASE = 'https://hackathon.api.qloo.com';

export const KIND_TO_TYPE = {
  song: 'urn:entity:artist',
  artist: 'urn:entity:artist',
  film: 'urn:entity:movie',
  tv: 'urn:entity:tv_show',
  book: 'urn:entity:book',
};

const TYPE_TO_KIND = {
  'urn:entity:artist': 'song',
  'urn:entity:movie': 'film',
  'urn:entity:tv_show': 'tv',
  'urn:entity:book': 'book',
};

export function makeQloo(env, fetchImpl = fetch) {
  async function get(path, params) {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetchImpl(url.toString(), {
          headers: { 'X-Api-Key': env.QLOO_API_KEY, accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        if (res.status === 401 || res.status === 403) {
          throw Object.assign(new Error(`Qloo refused the request (${res.status})`), { fatal: true });
        }
        if (!res.ok) throw new Error(`Qloo ${path} returned ${res.status}`);
        return await res.json();
      } catch (err) {
        lastError = err;
        if (err.fatal) break;
      }
    }
    throw Object.assign(lastError, { qloo: true });
  }

  return {
    async search(query, types) {
      const data = await get('/search', { query, types: types.join(','), take: 5 });
      return (data.results || []).map(normalize);
    },
    async insights(params) {
      const data = await get('/v2/insights', params);
      return (data.results?.entities || []).map(normalize);
    },
    async tags(query, tagType) {
      const data = await get('/v2/tags', {
        'filter.query': query,
        'filter.tag.types': tagType,
        'feature.semantic_search': true,
        take: 5,
      });
      return (data.results?.tags || data.results || []).map((t) => ({
        id: t.id || t.tag_id,
        name: t.name,
      }));
    },
  };
}

// Qloo puts most fields under `properties`; flatten what we use.
export function normalize(e) {
  const p = e.properties || {};
  const subtype = e.subtype || (e.types || [])[0] || e.type;
  const year =
    p.release_year ?? e.release_year ?? p.publication_year ?? e.publication_year ?? yearOf(p.release_date ?? e.release_date);
  return {
    id: e.entity_id || e.id,
    type: subtype,
    kind: TYPE_TO_KIND[subtype] || 'other',
    name: e.name,
    year: typeof year === 'string' ? parseInt(year, 10) : year,
    born: yearOf(p.date_of_birth ?? e.date_of_birth),
    popularity: e.popularity ?? p.popularity ?? 0,
    affinity: e.query?.affinity ?? e.affinity ?? 0,
    explain: explainIds(e.query?.explainability),
    tags: (e.tags || []).slice(0, 6).map((t) => t.name).filter(Boolean),
    blurb: p.short_description || e.short_description || '',
  };
}

function yearOf(date) {
  if (!date) return undefined;
  const y = parseInt(String(date).slice(0, 4), 10);
  return Number.isFinite(y) ? y : undefined;
}

// Explainability lists which input entities drove a recommendation.
// Collect any {entity_id, score} pairs, wherever they sit in the object.
function explainIds(x) {
  const out = [];
  (function walk(v) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (v.entity_id && typeof v.score === 'number') out.push({ id: v.entity_id, score: v.score });
    Object.values(v).forEach(walk);
  })(x);
  return out.sort((a, b) => b.score - a.score);
}
