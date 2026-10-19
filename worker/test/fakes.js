// Made-up test data only. Real Qloo responses must never be committed.
let n = 0;
const id = () => `fake-${++n}`;

function ent(subtype, name, props = {}, extra = {}) {
  return { entity_id: extra.id || id(), name, subtype, properties: props, popularity: 0.8, query: { affinity: 0.7, ...(extra.query || {}) }, tags: [] };
}

export function fakeQloo({ fail = false } = {}) {
  const seeds = {
    'elvis presley': ent('urn:entity:artist', 'Elvis Presley', { date_of_birth: '1935-01-08' }, { id: 'seed-elvis' }),
    'the sound of music': ent('urn:entity:movie', 'The Sound of Music', { release_year: 1965 }, { id: 'seed-som' }),
    'coronation street': ent('urn:entity:tv_show', 'Coronation Street', { release_year: 1960 }, { id: 'seed-corrie' }),
    'the beatles': ent('urn:entity:artist', 'The Beatles', {}, { id: 'seed-beatles' }),
  };
  const calls = [];
  const why = { explainability: { 'signal.interests.entities': [{ entity_id: 'seed-elvis', score: 0.6 }, { entity_id: 'seed-som', score: 0.3 }] } };
  const pools = {
    'urn:entity:artist': [
      ent('urn:entity:artist', 'The Beatles', {}, { id: 'seed-beatles', query: why }),
      ent('urn:entity:artist', 'Cliff Richard', { date_of_birth: '1940-10-14' }, { query: why }),
      ent('urn:entity:artist', 'Chubby Checker', { date_of_birth: '1941-10-03' }, { query: why }),
      ent('urn:entity:artist', 'Dusty Springfield', { date_of_birth: '1939-04-16' }, { query: why }),
      ent('urn:entity:artist', 'Taylor Swift', { date_of_birth: '1989-12-13' }, { query: why }),
    ],
    'urn:entity:movie': [
      ent('urn:entity:movie', 'Mary Poppins', { release_year: 1964 }, { query: why }),
      ent('urn:entity:movie', 'Grease', { release_year: 1978 }, { query: why }),
      ent('urn:entity:movie', 'Frozen', { release_year: 2013 }, { query: why }),
    ],
    'urn:entity:tv_show': [ent('urn:entity:tv_show', 'Top of the Pops', { release_year: 1964 }, { query: why })],
    'urn:entity:book': [ent('urn:entity:book', 'A Kestrel for a Knave', { publication_year: 1968 }, { query: why })],
  };
  return {
    calls,
    async search(query) {
      calls.push(['search', query]);
      if (fail) throw Object.assign(new Error('down'), { qloo: true, fatal: true });
      const { normalize } = await import('../src/qloo.js');
      const hit = seeds[query.toLowerCase()];
      return hit ? [normalize(hit)] : [];
    },
    async insights(params) {
      calls.push(['insights', params]);
      if (fail) throw Object.assign(new Error('down'), { qloo: true, fatal: true });
      const { normalize } = await import('../src/qloo.js');
      return (pools[params['filter.type']] || []).map(normalize);
    },
    async tags(query) {
      calls.push(['tags', query]);
      return [{ id: `urn:tag:genre:music:${query.replace(/\s+/g, '_')}`, name: query }];
    },
  };
}

// A model that answers by prompt type, the way the real one is asked to.
export function fakeAsk(script = {}) {
  return async (system, user, fallback) => {
    if (system.includes('pull out')) return script.understand ?? fallback;
    if (system.includes('Decide what to change')) return script.plan ?? fallback;
    if (system.includes('Pick moments')) return typeof script.compose === 'function' ? script.compose(user) : script.compose ?? fallback;
    return fallback;
  };
}
