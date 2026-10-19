# Remembering Room

**Plan a calm 30-minute reminiscence session for someone you love, from the songs, films, shows and books of their own younger years.**

Live: https://icelandic123.github.io/remembering-room/

You enter a few facts about an older relative: what you call them, the year they were born, where they grew up, and a few things they've always loved. Remembering Room returns a printable session card with five "moments": a familiar opener, a film or TV memory, a "tell me about…" moment, a sing-along and a gentle closer. Each moment has a reason it was picked, two story-inviting conversation starters and a link to find it.

After the visit you write how it went ("she didn't know the Beatles one, she loved anything she could dance to"). An agent decides what to swap, asks Qloo for something closer, and updates the card.

It is a conversation aid, not a medical tool. Nothing you type is stored.

## Why Qloo

A language model on its own gives everyone born in 1948 roughly the same "oldies" list, and it sometimes invents titles. Remembering Room grounds every moment in two signals:

1. **Their own taste**, expanded through Qloo's cross-domain taste graph. Each seed (Elvis, *The Sound of Music*) is resolved with `/search` and passed to `/v2/insights` as `signal.interests.entities`, so a film can be recommended because Elvis fans love it. `feature.explainability=true` tells us which seed drove each pick, and that becomes the reason shown on the card.
2. **Their memory years**: the "reminiscence bump", roughly ages 10 to 30, when people form their most vivid memories. Films and TV use `filter.release_year.min/max`, books use `filter.publication_year.*`, artists are filtered by birth date, and `signal.demographics.age` leans toward their generation.

The model only picks from what Qloo returned. A validator rejects anything invented or out of range and fills gaps from Qloo's top results, so the app still works if the model is unavailable.

## How it works

```
web/ (GitHub Pages)  ──POST /api/session──▶  worker/ (Cloudflare Worker)
                                              1. understand   (Workers AI: free text → named seeds, themes, avoid list)
                                              2. resolveSeeds (Qloo /search)
                                              3. gather       (Qloo /v2/insights × artists, films, TV, books)
                                              4. compose      (Workers AI picks 5 moments from Qloo results, writes prompts)
                                              5. validate     (years, avoid list, only real Qloo items; fallback fills gaps)
                     ──POST /api/refine───▶  agent plans replace/lean/avoid actions → Qloo /v2/tags + /v2/insights → recompose
```

- `worker/src/agent.js` contains the pipeline and the refine agent.
- `worker/src/qloo.js` is the Qloo client. It uses the hackathon base URL, the `X-Api-Key` header, timeouts and a retry.
- `worker/src/llm.js` is a Workers AI JSON helper that falls back cleanly.
- `worker/src/era.js` holds the memory years and Qloo age groups.
- `web/` is plain HTML, CSS and JavaScript with no build step.

## Run it

Tests use made-up data and need nothing installed:

```
node --test worker/test/*.test.js
```

For a local preview with made-up data (no keys needed), run the command below and open http://localhost:3000:

```
node scripts/dev-server.mjs
```

To run the real helper, you need a Qloo hackathon key and a Cloudflare account:

```
cd worker
echo "QLOO_API_KEY=your-key" > .dev.vars
npx wrangler dev
```

Then set `window.RR_API = 'http://localhost:8787'` in `web/config.js` and serve `web/`.

To check a deployed helper, run `node scripts/smoke.mjs https://remembering-room.<account>.workers.dev`.

### Deploy

`.github/workflows/deploy.yml` runs the tests, deploys the Worker with Wrangler, sets the `QLOO_API_KEY` Worker secret, publishes `web/` to GitHub Pages pointed at the Worker, and runs the smoke test. It needs these repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `QLOO_API_KEY`.

## Planning documents

This project was planned and built with the Devpost Learn skill pack. The plan lives in [`devpost/`](devpost/): [scope](devpost/scope.md), [PRD](devpost/prd.md), [spec](devpost/spec.md) and the [build checklist](devpost/checklist.md).

## Tools and AI use

- Built end to end by **Claude Code** (Anthropic), an AI coding agent, running the Devpost Learn skill pack on behalf of the entrant, bladoi. It wrote the planning documents, the code, the tests and this README.
- At runtime, **Workers AI** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) reads the free-text description, picks moments from Qloo's results and writes the conversation starters.
- **Qloo's Insights API** supplies every recommendation.

## Licence

MIT. Qloo data is not stored in this repository.
