import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSession, refine, splitList, rulePlan, checkProfile, InputError } from '../src/agent.js';
import { memoryYears, ageBucket } from '../src/era.js';
import { extractJSON } from '../src/llm.js';
import { fakeQloo, fakeAsk } from './fakes.js';

const JOAN = { name: 'Joan', birthYear: 1948, place: 'Liverpool, England', loves: 'Elvis Presley, The Sound of Music, dancing, Coronation Street', avoid: '' };

function ctx(script, qloo = fakeQloo()) {
  return { qloo, ask: fakeAsk(script), trace: [] };
}

test('memory years follow the reminiscence bump', () => {
  assert.deepEqual(memoryYears(1948, 2026), { from: 1958, to: 1978 });
  assert.deepEqual(memoryYears(2000, 2026), { from: 2010, to: 2026 });
  assert.equal(ageBucket(1948, 2026), '55_and_older');
  assert.equal(ageBucket(1985, 2026), '35_to_44');
});

test('without a model, a full five-moment card is still built', async () => {
  const c = ctx({});
  const card = await makeSession(c, JOAN);
  assert.equal(card.moments.length, 5);
  assert.deepEqual(card.moments.map((m) => m.slot), ['opener', 'screen', 'tell', 'singalong', 'closer']);
  for (const m of card.moments) {
    if (m.kind !== 'song') assert.ok(m.year >= 1953 && m.year <= 1978, `${m.title} ${m.year}`);
    assert.equal(m.prompts.length, 2);
    assert.ok(m.find.startsWith('https://'));
  }
  // Out-of-era things never appear.
  const titles = card.moments.map((m) => `${m.title} ${m.by}`).join(' ');
  assert.ok(!/Frozen|Taylor Swift/.test(titles), titles);
  // The opener is one of her own favourites.
  assert.ok(['Elvis Presley', 'The Sound of Music', 'Coronation Street'].includes(card.moments[0].by || card.moments[0].title));
  assert.ok(c.trace.some((t) => t.detail.includes('1958 to 1978')));
});

test('Qloo gets seeds, age group, years and explainability', async () => {
  const q = fakeQloo();
  await makeSession(ctx({}, q), JOAN);
  const movie = q.calls.find((c) => c[0] === 'insights' && c[1]['filter.type'] === 'urn:entity:movie')[1];
  assert.equal(movie['filter.release_year.min'], 1958);
  assert.equal(movie['filter.release_year.max'], 1978);
  assert.equal(movie['signal.demographics.age'], '55_and_older');
  assert.equal(movie['feature.explainability'], true);
  assert.ok(movie['signal.interests.entities'].includes('seed-elvis'));
});

test('model choices are kept when valid and rejected when invented', async () => {
  const compose = (user) => {
    const byName = Object.fromEntries(user.candidates.map((c) => [c.name, c.id]));
    return {
      title: 'A Sunday with Joan',
      moments: [
        { slot: 'opener', id: byName['Elvis Presley'], song: "Can't Help Falling in Love", songYear: 1961, reason: 'Her own favourite.', prompts: ['Who did you dance to this with?', 'Where did you first hear Elvis?'] },
        { slot: 'screen', id: 'made-up-id', reason: 'x', prompts: ['a', 'b'] },
        { slot: 'tell', id: byName['Top of the Pops'], reason: 'Thursday nights.', prompts: ['Who was your favourite act?', 'Where did you watch it?'] },
        { slot: 'singalong', id: byName['Mary Poppins'], reason: 'wrong kind' },
        { slot: 'closer', id: byName['A Kestrel for a Knave'], reason: 'Gentle.', prompts: ['Do you remember the ending?', 'What did school feel like?'] },
      ],
    };
  };
  const card = await makeSession(ctx({ compose }), JOAN);
  const [opener, screen, tell, singalong, closer] = card.moments;
  assert.equal(card.title, 'A Sunday with Joan');
  assert.equal(opener.title, "Can't Help Falling in Love");
  assert.equal(opener.by, 'Elvis Presley');
  assert.equal(opener.year, 1961);
  assert.notEqual(screen.qlooId, 'made-up-id');
  assert.ok(['film', 'tv'].includes(screen.kind));
  assert.equal(tell.title, 'Top of the Pops');
  assert.equal(singalong.kind, 'song');
  // A quiz-style prompt is rejected, so template prompts are used instead.
  assert.ok(!closer.prompts.some((p) => /do you remember/i.test(p)));
});

test('avoid list is respected', async () => {
  const card = await makeSession(ctx({}), { ...JOAN, avoid: 'The Beatles, Grease' });
  const all = card.moments.map((m) => `${m.title} ${m.by}`).join(' ');
  assert.ok(!/Beatles|Grease/.test(all), all);
});

test('Qloo outage raises a library error', async () => {
  await assert.rejects(makeSession(ctx({}, fakeQloo({ fail: true })), JOAN), (e) => e.qloo === true);
});

test('bad input is rejected kindly', () => {
  assert.throws(() => checkProfile({ birthYear: 1800, loves: 'x' }), InputError);
  assert.throws(() => checkProfile({ birthYear: 1950, loves: '' }), InputError);
});

test('refine swaps the moment the feedback is about', async () => {
  const compose = (user) => {
    const byName = Object.fromEntries(user.candidates.map((c) => [c.name, c.id]));
    if (user.slots.length === 5) {
      return {
        moments: [
          { slot: 'opener', id: byName['Elvis Presley'], song: 'Hound Dog', songYear: 1956, reason: 'Hers.', prompts: ['p1 tell me', 'p2 tell me'] },
          { slot: 'singalong', id: byName['The Beatles'], song: 'She Loves You', songYear: 1963, reason: 'Liverpool.', prompts: ['p3 tell me', 'p4 tell me'] },
        ],
      };
    }
    return { moments: [{ slot: 'singalong', id: byName['Chubby Checker'], song: 'The Twist', songYear: 1960, reason: 'You said she loved dancing.', prompts: ['Who taught you to twist?', 'Where did you go dancing?'] }] };
  };
  const q = fakeQloo();
  const card = await makeSession(ctx({ compose }, q), JOAN);
  const beatles = card.moments.findIndex((m) => m.by === 'The Beatles');
  assert.ok(beatles >= 0, 'test setup: Beatles moment present');

  const c2 = ctx({ compose }, q);
  const next = await refine(c2, JOAN, card, "She didn't know the Beatles one. She loved anything she could dance to.");
  assert.equal(next.moments.length, 5);
  assert.equal(next.moments[beatles].by, 'Chubby Checker');
  assert.equal(next.moments[beatles].isNew, true);
  assert.equal(next.moments.filter((m) => m.isNew).length, 1);
  assert.ok(q.calls.some((x) => x[0] === 'tags' && x[1] === 'dance'));
  const lastInsights = q.calls.filter((x) => x[0] === 'insights').at(-1)[1];
  assert.ok(lastInsights['filter.exclude.entities'].includes('seed-beatles'));
});

test('rule plan finds negative mentions and lean words', () => {
  const plan = rulePlan("She didn't know the Beatles one. She loved anything she could dance to.", [
    { title: 'Hound Dog', by: 'Elvis Presley' },
    { title: 'She Loves You', by: 'The Beatles' },
  ]);
  assert.deepEqual(plan.replace, [2]);
  assert.deepEqual(plan.leanWords, ['dance']);
});

test('splitList and extractJSON handle messy text', () => {
  assert.deepEqual(splitList('Elvis, The Sound of Music and dancing'), ['Elvis', 'The Sound of Music', 'dancing']);
  assert.deepEqual(extractJSON('Sure! {"a": "b}"} trailing'), { a: 'b}' });
  assert.equal(extractJSON('no json'), null);
});
