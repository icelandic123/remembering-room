import { memoryYears, ageBucket, artistFits, inYears } from './era.js';
import { KIND_TO_TYPE } from './qloo.js';
import { askJSON } from './llm.js';

export const SLOTS = ['opener', 'screen', 'tell', 'singalong', 'closer'];
const SLOT_LABEL = {
  opener: 'A familiar opener',
  screen: 'A film or TV memory',
  tell: 'Tell me about…',
  singalong: 'A sing-along',
  closer: 'A gentle closer',
};
const KINDS = ['song', 'film', 'tv', 'book'];
const SEARCH_TYPES = ['urn:entity:artist', 'urn:entity:movie', 'urn:entity:tv_show', 'urn:entity:book'];
const PER_KIND = 10;

export class InputError extends Error {}

export function checkProfile(p) {
  const name = String(p?.name || '').trim().slice(0, 40);
  const birthYear = parseInt(p?.birthYear, 10);
  const place = String(p?.place || '').trim().slice(0, 80);
  const loves = String(p?.loves || '').trim().slice(0, 400);
  const avoid = String(p?.avoid || '').trim().slice(0, 300);
  const now = new Date().getFullYear();
  if (!Number.isFinite(birthYear) || birthYear < 1915 || birthYear > now - 30) {
    throw new InputError('Please check the birth year.');
  }
  if (!loves) throw new InputError('Tell us at least one thing they have always loved.');
  return { name: name || 'them', birthYear, place, loves, avoid };
}

// ---------- Step 1: understand the free text ----------

export async function understand(ctx, profile) {
  // Without the model, capitalised items are treated as titles and the rest as themes.
  const items = splitList(profile.loves);
  const fallback = {
    seeds: items.filter((s) => /[A-Z0-9]/.test(s[0])).map((name) => ({ name, kind: 'unknown' })),
    themes: items.filter((s) => !/[A-Z0-9]/.test(s[0])),
    avoid: splitList(profile.avoid),
  };
  const out = await ctx.ask(
    `You help plan reminiscence sessions for older adults. Read what a family member wrote and pull out:
- "seeds": specific named things the person loves (singers, bands, films, TV shows, books, authors), each {"name": exact proper name, "kind": "artist"|"film"|"tv"|"book"}. Correct obvious misspellings. Max 6.
- "themes": short activity or mood words that are not titles (e.g. "dancing", "gardening", "the sea"). Max 4.
- "avoid": names or topics to steer clear of, from the avoid text only. Max 6.`,
    { loves: profile.loves, avoid: profile.avoid, birthYear: profile.birthYear, grewUp: profile.place },
    fallback,
    { maxTokens: 400 },
  );
  const seeds = (Array.isArray(out.seeds) ? out.seeds : fallback.seeds)
    .filter((s) => s && typeof s.name === 'string' && s.name.trim())
    .slice(0, 6)
    .map((s) => ({ name: s.name.trim(), kind: ['artist', 'film', 'tv', 'book'].includes(s.kind) ? s.kind : 'unknown' }));
  return {
    seeds: seeds.length ? seeds : fallback.seeds.slice(0, 6),
    themes: (Array.isArray(out.themes) ? out.themes : fallback.themes).filter((t) => typeof t === 'string').slice(0, 4),
    avoid: [...new Set([...(Array.isArray(out.avoid) ? out.avoid : []), ...fallback.avoid])]
      .filter((t) => typeof t === 'string' && t.trim())
      .slice(0, 8),
  };
}

export function splitList(text) {
  return String(text || '')
    .split(/,|;|\n|\band\b|&/i)
    .map((s) => s.trim().replace(/^(the films?|the show|the book|songs? by|music by)\s+/i, ''))
    .filter((s) => s.length > 1)
    .slice(0, 6);
}

// ---------- Step 2: find each seed in Qloo ----------

export async function resolveSeeds(ctx, seeds) {
  const found = await Promise.all(
    seeds.map(async (seed) => {
      const kindType = seed.kind === 'artist' ? KIND_TO_TYPE.artist : KIND_TO_TYPE[seed.kind];
      const types = kindType ? [kindType] : SEARCH_TYPES;
      try {
        let results = await ctx.qloo.search(seed.name, types);
        if (!results.length && kindType) results = await ctx.qloo.search(seed.name, SEARCH_TYPES);
        const best = results.find((r) => same(r.name, seed.name)) || results[0];
        if (!best) return { seed, hit: null };
        return { seed, hit: best };
      } catch (err) {
        if (err.fatal) throw err;
        return { seed, hit: null };
      }
    }),
  );
  for (const f of found) {
    ctx.trace.push(
      f.hit
        ? { step: 'search', detail: `Found ${f.hit.name}${f.hit.year ? ` (${f.hit.year})` : ''} in Qloo` }
        : { step: 'search', detail: `Couldn't find "${f.seed.name}" in Qloo` },
    );
  }
  return {
    resolved: found.filter((f) => f.hit).map((f) => f.hit),
    missing: found.filter((f) => !f.hit).map((f) => f.seed.name),
  };
}

// ---------- Step 3: ask Qloo for each kind ----------

export async function gather(ctx, { birthYear, years, seeds, excludeIds = [], avoid = [], tagIds = {}, kinds = KINDS }) {
  const age = ageBucket(birthYear);
  const seedIds = seeds.map((s) => s.id).join(',');
  const byKind = {};
  await Promise.all(
    kinds.map(async (kind) => {
      const params = {
        'filter.type': KIND_TO_TYPE[kind],
        'signal.interests.entities': seedIds || undefined,
        'signal.interests.tags': (tagIds[kind] || []).join(',') || undefined,
        'signal.demographics.age': age,
        'feature.explainability': true,
        'filter.exclude.entities': excludeIds.join(',') || undefined,
        take: 30,
      };
      if (kind === 'film' || kind === 'tv') {
        params['filter.release_year.min'] = years.from;
        params['filter.release_year.max'] = years.to;
      }
      if (kind === 'book') {
        params['filter.publication_year.min'] = years.from - 5;
        params['filter.publication_year.max'] = years.to;
      }
      let list = [];
      try {
        list = await ctx.qloo.insights(params);
      } catch (err) {
        if (err.fatal) throw err;
        ctx.trace.push({ step: 'qloo', detail: `Qloo had no ${label(kind)} for us this time` });
      }
      list = list.filter((e) => e.id && e.name && !excludeIds.includes(e.id) && !isAvoided(e, avoid));
      list = kind === 'song' ? list.filter((e) => artistFits(e, birthYear)) : list.filter((e) => inYears(e.year, kind === 'book' ? { from: years.from - 5, to: years.to } : years));
      byKind[kind] = list.slice(0, PER_KIND).map((e) => ({ ...e, kind, because: becauseText(e, seeds) }));
    }),
  );
  ctx.trace.push({
    step: 'qloo',
    detail: `Asked Qloo for ${kinds.map(label).join(', ')} from ${years.from} to ${years.to}, leaning toward people aged ${age.replace(/_/g, ' ')}: ${kinds.map((k) => `${byKind[k].length} ${label(k)}`).join(', ')}`,
  });
  return byKind;
}

function label(kind) {
  return { song: 'artists', film: 'films', tv: 'TV shows', book: 'books' }[kind];
}

export function becauseText(entity, seeds) {
  const names = (entity.explain || [])
    .filter((x) => x.score >= 0.1)
    .map((x) => seeds.find((s) => s.id === x.id)?.name)
    .filter(Boolean)
    .slice(0, 2);
  if (names.length) return `Loved by fans of ${names.join(' and ')}`;
  if (seeds.length) return `Close to the tastes of fans of ${seeds[0].name}`;
  return 'A favourite of their generation';
}

// ---------- Step 4: compose five moments ----------

export async function compose(ctx, profile, years, candidates, seedCands, slots = SLOTS, extra = '') {
  const pool = poolOf(candidates, seedCands);
  const compact = pool.map((c) => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    year: c.year,
    seed: !!c.seed,
    why: c.because,
    tags: c.tags.slice(0, 3),
  }));
  const fallback = { moments: [] };
  const out = await ctx.ask(
    `You plan a calm 30-minute reminiscence session for an older adult, to be run by a family member or carer.
Pick moments ONLY from the candidates given (use their "id"). Slots, in order:
- opener: something they will recognise at once; prefer a candidate with "seed": true.
- screen: a film or TV show.
- tell: a "tell me about…" moment (a TV show, book or film that invites stories about daily life then).
- singalong: an artist they can sing along to.
- closer: something gentle and warm to end on.
For an artist (kind "song"), choose one of that artist's best-known songs released between ${years.from} and ${years.to} and give its title and year. Never invent anything else.
For each moment write "reason" (max 14 words, plain, mention the person by name once at most, build on "why") and two "prompts": open, warm conversation starters that invite a story or a feeling, under 16 words each. Never quiz memory ("Do you remember…?", "What year…?"). Never mention illness.
Return {"title": "<a short warm title using their name>", "moments": [{"slot", "id", "song" (only for artists), "songYear" (only for artists), "reason", "prompts": [two strings]}]}.${extra}`,
    {
      person: { name: profile.name, born: profile.birthYear, grewUp: profile.place, loves: profile.loves },
      memoryYears: years,
      slots,
      candidates: compact,
    },
    fallback,
    { maxTokens: 1400 },
  );
  return out;
}

function poolOf(candidates, seedCands) {
  const seen = new Set();
  const pool = [];
  for (const c of [...seedCands, ...KINDS.flatMap((k) => candidates[k] || [])]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    pool.push(c);
  }
  return pool;
}

// ---------- Step 5: check the model's answer and fill gaps ----------

export function validateCard(profile, years, out, candidates, seedCands, slots = SLOTS, avoid = []) {
  const pool = poolOf(candidates, seedCands);
  const byId = new Map(pool.map((c) => [c.id, c]));
  const used = new Set();
  const moments = {};
  for (const m of Array.isArray(out?.moments) ? out.moments : []) {
    if (!m || !slots.includes(m.slot) || moments[m.slot]) continue;
    const c = byId.get(m.id);
    if (!c || used.has(c.id)) continue;
    if (m.slot === 'screen' && !['film', 'tv'].includes(c.kind)) continue;
    if (m.slot === 'singalong' && c.kind !== 'song') continue;
    const moment = toMoment(profile, years, m.slot, c, m);
    if (isAvoided({ name: `${moment.title} ${moment.by || ''}` }, avoid)) continue;
    moments[m.slot] = moment;
    used.add(c.id);
  }
  for (const slot of slots) {
    if (moments[slot]) continue;
    const c = pickFallback(slot, pool, used);
    if (!c) continue;
    moments[slot] = toMoment(profile, years, slot, c, {});
    used.add(c.id);
  }
  return slots.map((s) => moments[s]).filter(Boolean);
}

const FALLBACK_ORDER = {
  opener: ['seed', 'song', 'film', 'tv', 'book'],
  screen: ['film', 'tv'],
  tell: ['tv', 'book', 'film'],
  singalong: ['song'],
  closer: ['book', 'film', 'song', 'tv'],
};

function pickFallback(slot, pool, used) {
  for (const want of FALLBACK_ORDER[slot]) {
    const c = pool.find((p) => !used.has(p.id) && (want === 'seed' ? p.seed : p.kind === want && !p.seed));
    if (c) return c;
  }
  return pool.find((p) => !used.has(p.id) && (slot !== 'singalong' || p.kind === 'song'));
}

function toMoment(profile, years, slot, c, m) {
  const isSong = c.kind === 'song';
  const songTitle = isSong && typeof m.song === 'string' && m.song.trim() ? m.song.trim().slice(0, 80) : null;
  let year = isSong ? parseInt(m.songYear, 10) : c.year;
  if (!inYears(year, { from: years.from - 5, to: years.to })) year = isSong ? null : c.year;
  const prompts = Array.isArray(m.prompts) ? m.prompts.filter((p) => typeof p === 'string' && p.trim() && !/do you remember|what year/i.test(p)) : [];
  const title = isSong ? songTitle || c.name : c.name;
  return {
    slot,
    label: SLOT_LABEL[slot],
    kind: c.kind,
    title,
    by: isSong && songTitle ? c.name : null,
    year: year || null,
    reason: typeof m.reason === 'string' && m.reason.trim() ? m.reason.trim().slice(0, 160) : `${c.because}.`,
    prompts: prompts.length >= 2 ? prompts.slice(0, 2).map((p) => p.trim().slice(0, 140)) : templatePrompts(c, profile, slot),
    find: findLink(c, songTitle),
    qlooId: c.id,
    isNew: false,
  };
}

export function templatePrompts(c, profile, slot = 'opener') {
  const alt = ['tell', 'closer'].includes(slot) ? 1 : 0;
  const sets = {
    song: [
      [`Where were you when you used to hear ${c.name}?`, 'Who would you dance or sing along with?'],
      ['What did you wear on a night out back then?', 'Which song always got everyone up dancing?'],
    ],
    film: [
      ['Who did you go to the pictures with back then?', 'What was the cinema like where you grew up?'],
      ['Which film star did everyone talk about?', 'What would you buy to eat at the pictures?'],
    ],
    tv: [
      ['Where did the television sit in your house?', 'Who did you watch it with on a weekday evening?'],
      ['What was on the telly that the whole family watched?', 'What did your street look like back then?'],
    ],
    book: [
      ['What did you like to read when you had a quiet hour?', 'Who did you swap books and stories with?'],
      ['Who read to you, or who did you read to?', 'Where was your favourite place to sit and read?'],
    ],
  };
  return (sets[c.kind] || sets.book)[alt];
}

function findLink(c, songTitle) {
  if (c.kind === 'book') return `https://openlibrary.org/search?q=${encodeURIComponent(c.name)}`;
  const q = c.kind === 'song' ? `${c.name} ${songTitle || ''}` : `${c.name} ${c.year || ''} ${c.kind === 'tv' ? 'tv' : 'film'} clip`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q.trim())}`;
}

// ---------- Making a whole session ----------

export async function makeSession(ctx, rawProfile) {
  const profile = checkProfile(rawProfile);
  const years = memoryYears(profile.birthYear);
  ctx.trace.push({ step: 'years', detail: `${profile.name}'s memory years: ${years.from} to ${years.to}` });

  const understood = await understand(ctx, profile);
  ctx.trace.push({
    step: 'understand',
    detail: `Read the description: ${understood.seeds.map((s) => s.name).join(', ') || 'no named favourites'}${understood.themes.length ? `; themes: ${understood.themes.join(', ')}` : ''}`,
  });

  const { resolved, missing } = await resolveSeeds(ctx, understood.seeds);
  const avoidHits = await resolveAvoid(ctx, understood.avoid);
  const seeds = resolved.filter((s) => !isAvoided(s, understood.avoid));
  const candidates = await gather(ctx, {
    birthYear: profile.birthYear,
    years,
    seeds,
    excludeIds: [...seeds.map((s) => s.id), ...avoidHits],
    avoid: understood.avoid,
  });

  const seedCands = seeds
    .filter((s) => s.kind === 'song' ? true : inYears(s.year, { from: years.from - 5, to: years.to }))
    .map((s) => ({ ...s, seed: true, tags: s.tags || [], because: `One of ${profile.name === 'them' ? 'their' : `${profile.name}'s`} own favourites` }));

  const total = seedCands.length + KINDS.reduce((n, k) => n + candidates[k].length, 0);
  if (!total) throw Object.assign(new Error('Qloo returned nothing usable'), { qloo: true });

  const out = await compose(ctx, profile, years, candidates, seedCands);
  const moments = validateCard(profile, years, out, candidates, seedCands, SLOTS, understood.avoid);
  ctx.trace.push({ step: 'compose', detail: `Chose ${moments.length} moments and wrote conversation starters` });

  const notes = [];
  if (missing.length) notes.push(`We couldn't find ${missing.join(', ')} in our library, so the session leans on their generation's favourites.`);
  return {
    title: typeof out?.title === 'string' && out.title.trim() ? out.title.trim().slice(0, 60) : `An afternoon with ${profile.name}`,
    years,
    moments,
    notes,
    seeds: seeds.map((s) => ({ id: s.id, name: s.name })),
    avoid: understood.avoid,
    avoidIds: avoidHits,
  };
}

async function resolveAvoid(ctx, avoid) {
  const ids = [];
  await Promise.all(
    avoid.slice(0, 4).map(async (name) => {
      try {
        const r = await ctx.qloo.search(name, SEARCH_TYPES);
        const hit = r.find((x) => same(x.name, name));
        if (hit) ids.push(hit.id);
      } catch (err) {
        if (err.fatal) throw err;
      }
    }),
  );
  return ids;
}

// ---------- Refining after a visit ----------

export async function refine(ctx, rawProfile, card, feedback) {
  const profile = checkProfile(rawProfile);
  const years = card?.years?.from ? card.years : memoryYears(profile.birthYear);
  const moments = Array.isArray(card?.moments) ? card.moments.slice(0, 5) : [];
  if (!moments.length) throw new InputError('Make a session first.');
  const text = String(feedback || '').trim().slice(0, 500);
  if (!text) throw new InputError('Tell us how it went in a sentence or two.');

  const listing = moments.map((m, i) => ({ n: i + 1, slot: m.slot, kind: m.kind, title: m.title, by: m.by }));
  const fallback = rulePlan(text, moments);
  const plan = await ctx.ask(
    `A family member ran a reminiscence session and wrote how it went. Decide what to change.
Return {"replace": [moment numbers that did not land or that they ask to change], "leanWords": [up to 3 short genre or mood words to lean toward, e.g. "dance", "rock and roll", "comedy"], "newSeeds": [{"name","kind":"artist"|"film"|"tv"|"book"} for specific things they say the person loved], "avoid": [names to never suggest again], "summary": "one short sentence on what you will do"}.
Only replace moments the feedback is about. If the feedback is only positive and names no moment, replace the one least related to what they loved.`,
    { feedback: text, moments: listing },
    fallback,
    { maxTokens: 400 },
  );
  const replace = [...new Set((Array.isArray(plan.replace) ? plan.replace : fallback.replace).map(Number))].filter((n) => n >= 1 && n <= moments.length);
  const toReplace = replace.length ? replace : fallback.replace;
  const leanWords = (Array.isArray(plan.leanWords) ? plan.leanWords : fallback.leanWords).filter((w) => typeof w === 'string').slice(0, 3);
  const newAvoid = [...(card.avoid || []), ...(Array.isArray(plan.avoid) ? plan.avoid : [])].filter((w) => typeof w === 'string');
  ctx.trace.push({ step: 'plan', detail: typeof plan.summary === 'string' && plan.summary ? plan.summary : `Swap moment ${toReplace.join(' and ')}` });

  const newSeedList = (Array.isArray(plan.newSeeds) ? plan.newSeeds : fallback.newSeeds).filter((s) => s && typeof s.name === 'string').slice(0, 3);
  const { resolved: added } = newSeedList.length ? await resolveSeeds(ctx, newSeedList) : { resolved: [] };
  const seeds = [...added, ...(card.seeds || [])].slice(0, 6);

  const slots = toReplace.map((n) => moments[n - 1].slot);
  const kinds = [...new Set(toReplace.map((n) => moments[n - 1].kind).concat(slots.includes('screen') ? ['film', 'tv'] : []))].filter((k) => KINDS.includes(k));

  const tagIds = {};
  for (const word of leanWords) {
    for (const kind of kinds) {
      try {
        const tags = await ctx.qloo.tags(word, kind === 'song' ? 'urn:tag:genre:music' : 'urn:tag:genre:media');
        if (tags[0]?.id) (tagIds[kind] ||= []).push(tags[0].id);
      } catch (err) {
        if (err.fatal) throw err;
      }
    }
  }
  if (Object.keys(tagIds).length) ctx.trace.push({ step: 'tags', detail: `Leaning toward ${leanWords.join(', ')} using Qloo genre tags` });

  const keepIds = moments.map((m) => m.qlooId);
  const candidates = await gather(ctx, {
    birthYear: profile.birthYear,
    years,
    seeds,
    excludeIds: [...keepIds, ...(card.avoidIds || [])],
    avoid: newAvoid,
    tagIds,
    kinds,
  });
  for (const k of KINDS) candidates[k] ||= [];
  const seedCands = added.map((s) => ({ ...s, seed: true, tags: s.tags || [], because: 'You said they loved this' }));

  const out = await compose(
    ctx,
    profile,
    years,
    candidates,
    seedCands,
    slots,
    `\nThis is an update after a visit. The family member said: "${text.replace(/"/g, "'")}". Each reason should reflect that feedback in a few words.`,
  );
  const fresh = validateCard(profile, years, out, candidates, seedCands, slots, newAvoid);
  const next = moments.map((m) => ({ ...m, isNew: false }));
  for (const f of fresh) {
    const i = next.findIndex((m, idx) => m.slot === f.slot && toReplace.includes(idx + 1));
    if (i >= 0) next[i] = { ...f, isNew: true };
  }
  const changed = next.filter((m) => m.isNew).length;
  ctx.trace.push({ step: 'compose', detail: changed ? `Swapped ${changed} moment${changed > 1 ? 's' : ''}` : 'Found nothing better to swap in' });
  return {
    ...card,
    moments: next,
    seeds: seeds.map((s) => ({ id: s.id, name: s.name })),
    avoid: newAvoid,
    notes: changed ? card.notes || [] : [...(card.notes || []), 'We kept the session as it was; nothing better came up.'],
  };
}

const NEGATIVE = /(didn'?t|did not|not|no|never|wasn'?t|upset|sad|bored|confus|disliked|hated|skip|too)/i;

export function rulePlan(text, moments) {
  const lower = text.toLowerCase();
  const replace = [];
  moments.forEach((m, i) => {
    const names = [m.title, m.by].filter(Boolean).map((s) => s.toLowerCase());
    for (const n of names) {
      const words = n.split(/\s+/).filter((w) => w.length > 3 && !['songs', 'the'].includes(w));
      const hit = lower.includes(n) || words.some((w) => lower.includes(w));
      if (hit) {
        const near = lower.slice(Math.max(0, lower.indexOf(words[0] || n) - 40), lower.indexOf(words[0] || n) + 40);
        if (NEGATIVE.test(near)) replace.push(i + 1);
        break;
      }
    }
  });
  const loved = [...lower.matchAll(/lov(?:ed|es)\s+(?:the\s+|anything\s+(?:she|he|they)\s+could\s+)?([a-z' ]{3,30})/g)].map((m) => m[1].trim());
  const leanWords = loved.flatMap((l) => (/danc/.test(l) ? ['dance'] : /sing/.test(l) ? ['sing along'] : /laugh|funny|comed/.test(l) ? ['comedy'] : [])).slice(0, 3);
  return {
    replace: replace.length ? [...new Set(replace)] : [moments.length],
    leanWords,
    newSeeds: [],
    avoid: [],
  };
}

// ---------- helpers ----------

export function isAvoided(entity, avoid) {
  const name = String(entity.name || '').toLowerCase();
  return avoid.some((a) => {
    const t = String(a).toLowerCase().trim();
    return t.length > 2 && (name.includes(t) || (t.length > 5 && t.includes(name) && name.length > 3));
  });
}

function same(a, b) {
  const n = (s) => String(s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
  return n(a) === n(b);
}
