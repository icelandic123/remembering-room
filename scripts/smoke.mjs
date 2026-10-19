// Calls the live helper with the example profile and checks the card's rules.
// Prints only counts and titles, never raw Qloo responses.
const api = (process.argv[2] || process.env.RR_API || '').replace(/\/$/, '');
if (!api) throw new Error('Usage: node scripts/smoke.mjs <helper url>');

const profile = { name: 'Joan', birthYear: 1948, place: 'Liverpool, England', loves: 'Elvis, The Sound of Music, dancing, Coronation Street', avoid: '' };

async function post(path, body) {
  const t = Date.now();
  const res = await fetch(api + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  console.log(`${path}: HTTP ${res.status} in ${Date.now() - t} ms`);
  if (!res.ok) throw new Error(data.error);
  return data;
}

const health = await (await fetch(api + '/api/health')).json();
console.log('health', health);

const { card, trace } = await post('/api/session', { profile });
for (const t of trace) console.log('  trace:', t.detail);
for (const m of card.moments) console.log(`  ${m.slot}: ${m.title}${m.by ? ` (${m.by})` : ''} ${m.year || ''} | ${m.reason}`);
const fails = [];
if (card.moments.length !== 5) fails.push(`expected 5 moments, got ${card.moments.length}`);
for (const m of card.moments) {
  if (m.year && (m.year < card.years.from - 5 || m.year > card.years.to)) fails.push(`${m.title} year ${m.year} out of range`);
  if (m.prompts?.length !== 2) fails.push(`${m.title} has ${m.prompts?.length} prompts`);
}
if (!trace.some((t) => t.step === 'qloo')) fails.push('no Qloo step in trace');

const sing = card.moments.findIndex((m) => m.slot === 'singalong');
const flagged = card.moments[sing];
const feedback = `She didn't know the ${flagged.by || flagged.title} one. She loved anything she could dance to.`;
const refined = await post('/api/refine', { profile, card, feedback });
for (const t of refined.trace) console.log('  trace:', t.detail);
const after = refined.card.moments;
console.log(`  after: ${after.map((m) => `${m.isNew ? '*' : ''}${m.title}`).join(' | ')}`);
if (after.length !== 5) fails.push('refine changed the number of moments');
if (!after.some((m) => m.isNew)) fails.push('refine swapped nothing');

if (fails.length) {
  console.error('FAIL\n' + fails.join('\n'));
  process.exit(1);
}
console.log('OK');
