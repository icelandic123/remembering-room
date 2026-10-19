const API = (window.RR_API || '').replace(/\/$/, '');

const EXAMPLE = {
  name: 'Joan',
  birthYear: '1948',
  place: 'Liverpool, England',
  loves: 'Elvis, The Sound of Music, dancing, Coronation Street',
  avoid: '',
};

const STEPS = {
  session: [
    'Reading what they love',
    'Finding each favourite in Qloo',
    'Looking across their memory years',
    'Putting the session together',
  ],
  refine: ['Reading how it went', 'Deciding what to swap', 'Asking Qloo for something closer', 'Updating the session'],
};

const KIND = { song: 'Song', film: 'Film', tv: 'TV', book: 'Book' };

const $ = (sel) => document.querySelector(sel);
const form = $('#profile');
const state = { profile: null, card: null };

$('#example').addEventListener('click', () => {
  for (const [k, v] of Object.entries(EXAMPLE)) form.elements[k].value = v;
  form.elements.loves.focus();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const profile = Object.fromEntries(new FormData(form));
  const problem = checkForm(profile);
  showError('#form-error', problem);
  if (problem) return;

  const data = await call('/api/session', { profile }, 'session', $('#make'), '#form-error');
  if (!data) return;
  state.profile = profile;
  state.card = data.card;
  render(data.card);
  renderTrace(data.trace);
  $('#feedback').hidden = false;
  $('#card').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#update').addEventListener('click', async () => {
  const feedback = $('#feedback textarea').value.trim();
  showError('#feedback-error', feedback ? '' : 'Tell us how it went in a sentence or two.');
  if (!feedback || !state.card) return;
  const data = await call('/api/refine', { profile: state.profile, card: state.card, feedback }, 'refine', $('#update'), '#feedback-error');
  if (!data) return;
  state.card = data.card;
  render(data.card);
  renderTrace(data.trace);
  const first = document.querySelector('.moment.is-new');
  (first || $('#card')).scrollIntoView({ behavior: 'smooth', block: 'center' });
});

$('#print').addEventListener('click', () => window.print());

function checkForm(p) {
  const year = parseInt(p.birthYear, 10);
  const now = new Date().getFullYear();
  if (!year) return 'Please add the year they were born.';
  if (year < 1915 || year > now - 30) return 'Please check the birth year. Remembering Room is made for older adults.';
  if (!p.loves.trim()) return "Please add at least one thing they've always loved.";
  return '';
}

async function call(path, body, kind, button, errorSel) {
  button.disabled = true;
  const stop = runProgress(STEPS[kind]);
  try {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    await stop(true);
    showError(errorSel, '');
    return data;
  } catch (err) {
    await stop(false);
    const offline = err instanceof TypeError;
    showError(errorSel, offline ? "We couldn't reach Remembering Room. Please check your connection and try again." : err.message);
    return null;
  } finally {
    button.disabled = false;
  }
}

function runProgress(steps) {
  const box = $('#progress');
  const list = box.querySelector('ol');
  list.innerHTML = steps.map((s) => `<li>${esc(s)}</li>`).join('');
  box.hidden = false;
  const items = [...list.children];
  let i = 0;
  items[0].className = 'active';
  const timer = setInterval(() => {
    if (i >= items.length - 1) return;
    items[i].className = 'done';
    items[++i].className = 'active';
  }, 1400);
  return async (ok) => {
    clearInterval(timer);
    if (ok) {
      for (const li of items) li.className = 'done';
      await new Promise((r) => setTimeout(r, 450));
    }
    box.hidden = true;
  };
}

function render(card) {
  const el = $('#card');
  const who = state.profile?.name?.trim() || 'them';
  el.innerHTML = `
    <div class="card-head">
      <p class="eyebrow">A 30-minute session</p>
      <h2>${esc(card.title)}</h2>
      <p class="years">From ${esc(who)}'s memory years, ${card.years.from} to ${card.years.to}</p>
    </div>
    ${card.moments.map(moment).join('')}
    ${(card.notes || []).map((n) => `<p class="notes">${esc(n)}</p>`).join('')}
  `;
  el.hidden = false;
}

function moment(m, i) {
  const kind = m.kind === 'song' && !m.by ? 'Music' : KIND[m.kind] || '';
  const meta = [kind, m.year || ''].filter(Boolean).join(' · ');
  return `
    <article class="moment${m.isNew ? ' is-new' : ''}">
      <div class="num" aria-hidden="true">${i + 1}</div>
      <div class="label">${esc(m.label)}${m.isNew ? '<span class="badge">New</span>' : ''}</div>
      <h3>${esc(m.title)}${m.by ? ` <span class="by">${esc(m.by)}</span>` : ''}</h3>
      <div class="meta">${esc(meta)}</div>
      <p class="reason">${esc(m.reason)}</p>
      <ul>${m.prompts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      <a class="find" href="${esc(m.find)}" target="_blank" rel="noopener">Find it →</a>
    </article>`;
}

function renderTrace(trace) {
  const box = $('#howmade');
  box.querySelector('ol').innerHTML = (trace || []).map((t) => `<li>${esc(t.detail)}</li>`).join('');
  box.hidden = !trace?.length;
}

function showError(sel, msg) {
  const el = $(sel);
  el.textContent = msg || '';
  el.hidden = !msg;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
