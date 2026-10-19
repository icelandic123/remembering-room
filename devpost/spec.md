---
doc: spec
status: approved
---

# Remembering Room — Technical Spec

## How This Works, In Plain Language
There are two pieces.

1. **The page** is a single web page that a browser loads from GitHub Pages. It shows the form, sends what you typed to the helper, and draws the session card. It stores nothing.
2. **The helper** is a small server program running on Cloudflare Workers. It holds the private Qloo key, so the key never reaches the browser. When the page asks for a session, the helper:
   - asks a language model to turn the free text ("Elvis, The Sound of Music, dancing") into a list of named things and themes,
   - looks each named thing up in **Qloo**, a taste-data service that knows which films, artists, shows and books are loved by the same people,
   - asks Qloo for recommendations seeded by those things, limited to the person's memory years and leaning toward their age group,
   - asks the language model to pick five moments from Qloo's results only, in a set order, and to write the reasons and conversation starters,
   - checks the answer (right years, nothing on the avoid list, only things Qloo returned) and fills any gap itself.

After a visit, the page sends back the card and a sentence about how it went. The helper's agent reads it, decides which moments to drop and what to lean toward, runs the Qloo searches it needs, and swaps those moments.

Why this shape: the key has to stay secret, so a server is unavoidable. A Cloudflare Worker is the smallest free server that can also run a language model (Workers AI), so there is one account and nothing to maintain. The page has no build step, so it is easy to read and change.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.
1. Maya fills the form and presses **Make a session**. `web/app.js` sends `POST /api/session` with `{name, birthYear, place, loves, avoid}` to the helper and starts the progress line.
2. `worker/src/index.js` validates the input and calls `makeSession` in `worker/src/agent.js`.
3. `understand` (in `agent.js`) calls the model through `worker/src/llm.js` and gets `{seeds:[{name, kind}], themes:[], avoid:[]}`. If the model fails, a plain comma split is used.
4. `resolveSeeds` calls Qloo `/search` once per seed (`worker/src/qloo.js`) and keeps the best match.
5. `gather` calls Qloo `/v2/insights` four times in parallel (artists, films, TV, books) with the seeds, the age group from `worker/src/era.js`, the memory-year filters and `feature.explainability=true`.
6. `compose` gives the model a compact list of candidates and asks for the five moments as JSON. `validateCard` enforces the rules and `fallbackCard` fills any gaps without the model.
7. The helper returns `{card, trace}`. The page draws the card and puts the trace under "How this session was made".
8. Maya writes how it went and presses **Update the session**. The page sends `POST /api/refine` with `{profile, card, feedback}`.
9. `refine` in `agent.js` asks the model for a plan of actions (`replace`, `lean`, `avoid`), carries them out with the same Qloo tools, then composes only the replaced moments. The page redraws the card and marks the new moments.

## Stack
- **Page:** plain HTML, CSS and JavaScript modules, with no framework and no build step, so it stays readable. Hosted on GitHub Pages: https://docs.github.com/pages
- **Helper:** a Cloudflare Worker in JavaScript (ES modules), deployed with Wrangler 4: https://developers.cloudflare.com/workers/ and https://developers.cloudflare.com/workers/wrangler/
- **Language model:** Workers AI, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`: https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/ . The free allowance is 10,000 neurons a day, which is roughly 40 sessions. That is enough for a demo, and responses are cached.
- **Taste data:** Qloo Insights API, hackathon environment: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
- **Tests:** Node's built-in test runner (`node --test`) with fake Qloo and model responses. No test libraries.
- **CI and deploy:** GitHub Actions.

## Where It Runs and How Someone Tries It
- **Live:** the page is at `https://icelandic123.github.io/remembering-room/` and the helper at `https://remembering-room.<account>.workers.dev`. The page reads the helper URL from `web/config.js`.
- **Local page:** `npx serve web` (or any static server), then open http://localhost:3000. Set `window.RR_API` in `web/config.js` to a helper URL.
- **Local helper:** `cd worker && npx wrangler dev`, with `QLOO_API_KEY` in `worker/.dev.vars` (not committed). Workers AI runs remotely, so you need to be logged in to Cloudflare.
- **Tests:** `node --test worker/test/`.
- **Demo recording:** a Playwright script, `scripts/record-demo.mjs`, drives the live page through the core journey and records the screen. CI runs it and saves the video as an artifact.
- **Secrets:** `QLOO_API_KEY` is a Worker secret, set from a GitHub Actions secret during deploy. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are GitHub Actions secrets.

## Look and Feel
From `prd.md > Look and Feel`. Background `#f6f1e7` (paper), text `#2b2622` (ink), accent `#9c4a3c` (brick), muted `#6d645b`, rules `#ddd3c3`. Headings in "Fraunces" (a soft serif) and body in "Atkinson Hyperlegible" (a typeface designed for low-vision readers), both from Google Fonts with system fallbacks. Body text 19px, line height 1.55, maximum width 720px. Moments are numbered with large serif numerals, like a printed programme. Buttons are solid brick with white text and large touch targets of at least 48px. Interface copy is short, plain and kind. Print styles: white background, black text, form and controls hidden.

## Components

### Page shell and form (`web/index.html`, `web/styles.css`)
The header, the form with five fields, the "Try an example" link and the privacy line.
PRD ref: `prd.md > Screens and Layout`, `prd.md > States and Boundaries`.

### Page logic (`web/app.js`)
Reads the form, checks the birth year, calls the helper, runs the progress line, draws the card, handles the update box and shows errors. It keeps the current profile and card in memory only.
PRD ref: `prd.md > The Core Journey`, `prd.md > Updating after a visit`.

### Helper router (`worker/src/index.js`)
Handles `POST /api/session`, `POST /api/refine` and `GET /api/health`. It also handles CORS for the Pages origin and caches session responses by input hash for an hour with the Workers Cache API.
PRD ref: `prd.md > Making a session`.

### Memory years (`worker/src/era.js`)
`memoryYears(birthYear)` returns `{from: birthYear+10, to: min(birthYear+30, thisYear)}`. `ageBucket(birthYear)` returns the matching Qloo age group (`55_and_older` and so on). `artistFits(artist, years)` keeps artists born between about 35 years before and 12 years after the person, or with no birth date.
PRD ref: `prd.md > Product Decisions`.

### Qloo client (`worker/src/qloo.js`)
`search(query, types)` and `insights(params)` against `https://hackathon.api.qloo.com`, using the `X-Api-Key` header, an 8-second timeout and one retry. `normalize(entity)` flattens `properties` into `{id, kind, name, year, born, popularity, affinity, because:[seed names], tags:[...]}`.
PRD ref: `prd.md > Making a session`.

### Model wrapper (`worker/src/llm.js`)
`askJSON(env, system, user, fallback)` calls Workers AI, pulls the first JSON object out of the reply, and returns `fallback` on any failure, so the helper never breaks because of the model.

### Agent (`worker/src/agent.js`)
`understand`, `resolveSeeds`, `gather`, `compose`, `validateCard`, `fallbackCard`, `makeSession` and `refine`. It records every step in `trace` with plain-language text such as "Looked up Elvis Presley in Qloo".
PRD ref: `prd.md > Making a session`, `prd.md > Updating after a visit`.

### Demo recorder (`scripts/record-demo.mjs`)
Playwright drives the live page: it fills in Joan, waits for the card, scrolls, enters feedback, waits for the update, and saves the recording.
PRD ref: `prd.md > What We're Building`.

## Data Model
Nothing is stored. The request and response shapes are:
- **Profile:** `{name, birthYear, place, loves, avoid}`, all strings except `birthYear`.
- **Moment:** `{slot: "opener"|"screen"|"tell"|"singalong"|"closer", kind: "song"|"film"|"tv"|"book", title, by, year, reason, prompts:[string, string], find: url, qlooId, isNew}`. For songs, `title` is a well-known song and `by` is the Qloo artist.
- **Card:** `{title, years:{from, to}, moments:[5 Moments], notes:[string]}`.
- **Trace:** `[{step, detail}]`.
The page keeps the last profile and card in a variable. A reload starts fresh, as the PRD's privacy rule requires.

## File Structure
```
remembering-room/
├── web/
│   ├── index.html        # page shell, form, card container
│   ├── styles.css        # look and feel and print styles
│   ├── app.js            # form handling, API calls, rendering
│   └── config.js         # helper URL (no secrets)
├── worker/
│   ├── wrangler.toml     # Worker name, AI binding, vars
│   ├── src/
│   │   ├── index.js      # router, CORS, cache
│   │   ├── agent.js      # understand / gather / compose / refine
│   │   ├── qloo.js       # Qloo API client and normalizer
│   │   ├── llm.js        # Workers AI JSON helper
│   │   └── era.js        # memory years and age group
│   └── test/
│       ├── fakes.js      # fake Qloo and fake model (synthetic data only)
│       └── agent.test.js
├── scripts/
│   ├── smoke.mjs         # calls the live helper and checks the card's rules
│   └── record-demo.mjs   # Playwright demo recording
├── .github/workflows/
│   ├── ci.yml            # tests on every push
│   └── deploy.yml        # deploy Worker and Pages, then smoke test
├── devpost/              # Devpost learning workspace (scope, prd, spec, checklist)
├── LICENSE               # MIT
└── README.md
```

## External Services and Dependencies
- **Qloo Search** `GET https://hackathon.api.qloo.com/search?query=Elvis%20Presley&types=urn:entity:artist&take=3`, header `X-Api-Key`. Returns `{results:[entity]}`. Docs: https://docs.qloo.com/reference/get-search
- **Qloo Insights** `GET https://hackathon.api.qloo.com/v2/insights?filter.type=urn:entity:movie&signal.interests.entities=<ids>&signal.demographics.age=55_and_older&filter.release_year.min=1958&filter.release_year.max=1978&feature.explainability=true&take=15`. Books use `filter.publication_year.*`, and artists take no year filter, so they are filtered by birth date on our side. Returns `{success, results:{entities:[…]}}`. Docs: https://docs.qloo.com/reference/insights-api-deep-dive and https://docs.qloo.com/reference/available-parameters-by-entity-type
- **Qloo Tags** `GET /v2/tags?filter.query=dance&filter.tag.types=urn:tag:genre:music` finds genre tags to lean toward during a refine. Docs: https://docs.qloo.com/reference/search-tags
- Key: personal hackathon key, rate limits set by Qloo. Free. Qloo responses are never committed to the repository, as Qloo's terms require. Test fixtures are made up.
- **Workers AI**, through the `AI` binding. It is free within the daily allowance. Docs: https://developers.cloudflare.com/workers-ai/
- **GitHub Pages and Actions**: free for public repositories.

## Important Failure Modes
- **Qloo returns nothing for a seed or an era** → the helper uses the age-group signal alone, and the card's notes say what couldn't be found.
- **The model returns broken or invented items** → `validateCard` drops anything not in Qloo's results or outside the years, and `fallbackCard` fills the slots from the top Qloo results with template prompts.
- **The model allowance runs out or Workers AI is down** → the whole session is built with `fallbackCard` and template prompts, and the card still works.
- **Qloo is down or the key is wrong** → the page shows the plain "couldn't reach our library" message and keeps the form filled.

## What Was Simplified and Why
- **Song titles come from the model**, picked from the Qloo artist's best-known songs, because Qloo recommends artists rather than tracks. The fuller version would check titles against a music catalogue.
- **The progress line is staged on the page** rather than streamed from the server, because streaming adds moving parts for a few seconds of waiting. The real steps appear afterwards in "How this session was made".
- **Caching uses the Workers Cache API** (per data centre), not a database, because nothing needs to persist.

## Decisions and Open Issues
- The memory years (+10 to +30) are a product decision from `prd.md > Product Decisions`. The age-group signal is derived from it.
- An uncertainty to check in the first slice: how well the hackathon Qloo data covers films and TV from the 1950s to the 1970s, and whether `feature.explainability` returns seed names we can show. Evidence needed: the smoke script prints how many results come back per kind for the example profile.
- Open: the exact Worker subdomain, known after the Cloudflare account exists.
