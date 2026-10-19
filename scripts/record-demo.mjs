// Records the demo video: drives the live page through the core journey
// with on-screen captions. Usage: node scripts/record-demo.mjs <page url> <out dir>
import { chromium } from 'playwright';

const url = process.argv[2] || 'https://icelandic123.github.io/remembering-room/';
const outDir = process.argv[3] || 'demo-video';
const size = { width: 1280, height: 720 };

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir: outDir, size } });
const page = await context.newPage();
const pause = (ms) => page.waitForTimeout(ms);

async function caption(text, ms = 3200) {
  await page.evaluate((t) => {
    let el = document.getElementById('demo-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-caption';
      Object.assign(el.style, {
        position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)', zIndex: 9999,
        background: 'rgba(43,38,34,0.92)', color: '#fff', padding: '14px 26px', borderRadius: '14px',
        font: '600 24px/1.35 "Atkinson Hyperlegible", system-ui, sans-serif', maxWidth: '1000px', textAlign: 'center',
        boxShadow: '0 10px 30px rgba(0,0,0,0.25)', transition: 'opacity .3s',
      });
      document.body.appendChild(el);
    }
    el.style.opacity = t ? '1' : '0';
    if (t) el.textContent = t;
  }, text);
  if (ms) await pause(ms);
}

async function typeInto(selector, text) {
  await page.click(selector);
  await page.type(selector, text, { delay: 45 });
}

async function scrollTo(selector, block = 'start') {
  await page.evaluate(([s, b]) => document.querySelector(s)?.scrollIntoView({ behavior: 'smooth', block: b }), [selector, block]);
  await pause(1200);
}

async function slowScroll(px, steps = 10) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, px / steps);
    await pause(140);
  }
}

await page.goto(url, { waitUntil: 'networkidle' });
await pause(800);
await caption('Visiting someone with dementia? It can be hard to know what to do together.', 3600);
await caption('Remembering Room plans a calm half hour from the years they remember best.', 3400);

await caption("Tell it a little about them. Here's Joan, born in 1948 in Liverpool.", 1200);
await typeInto('input[name=name]', 'Joan');
await typeInto('input[name=birthYear]', '1948');
await typeInto('input[name=place]', 'Liverpool, England');
await typeInto('textarea[name=loves]', 'Elvis, The Sound of Music, dancing, Coronation Street');
await pause(800);
await caption('Press "Make a session"…', 1200);
await page.click('#make');
await caption('An agent reads the description, finds each favourite in Qloo, and asks Qloo for what fans of them loved, from Joan\'s years 1958 to 1978.', 0);
await page.waitForSelector('#card:not([hidden]) .moment', { timeout: 60000 });
await pause(1600);
await caption('Five moments, each with a reason and two gentle conversation starters.', 3000);
await slowScroll(520, 12);
await caption('Every pick comes from Qloo\'s taste data, checked against her memory years. Nothing is invented.', 3400);
await slowScroll(700, 14);
await pause(1200);

await scrollTo('#feedback', 'center');
await caption('After the visit, say how it went, in your own words.', 1400);
const sing = await page.evaluate(() => {
  const m = [...document.querySelectorAll('.moment')][3];
  return m?.querySelector('.by')?.textContent || m?.querySelector('h3')?.textContent || 'the fourth';
});
await typeInto('#feedback textarea', `She didn't know the ${sing.trim().replace(/^the\s+/i, '')} one. She loved anything she could dance to.`);
await pause(600);
await page.click('#update');
await caption('The agent decides what to swap, leans toward dance music with Qloo genre tags, and updates the card.', 0);
await page.waitForSelector('.moment.is-new', { timeout: 60000 });
await page.evaluate(() => document.querySelector('.moment.is-new')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
await pause(1500);
await caption('One moment swapped, marked "New", with a reason that reflects what you said.', 3600);

await page.evaluate(() => { const d = document.getElementById('howmade'); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
await pause(1200);
await caption('You can see every step it took. Print the card and take it with you.', 3600);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await pause(1200);
await caption('Remembering Room: her songs, her films, her years. Built with Qloo and Claude Code.', 3600);
await caption('', 600);

await context.close();
await browser.close();
console.log('Saved video in', outDir);
