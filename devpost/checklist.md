---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast (the builder is an agent working for bladoi; checkpoints are run by the agent in a real browser and recorded here)

## Slices

- [x] **1. A session card appears for Joan, built from Qloo-shaped results**
  Becomes usable: The page loads, "Try an example" fills in Joan, and **Make a session** shows a five-moment card from the helper. The helper runs the whole agent pipeline against fake Qloo and model responses in tests, and against real Qloo once the key exists.
  Why now: It is the kernel (her tastes plus her memory years, each with a reason) end to end, and it puts the riskiest pieces, the Qloo calls and the model's JSON, in the first slice.
  PRD ref: `prd.md > The Core Journey` (steps 1-5), `prd.md > Making a session`
  Spec ref: `spec.md > Components`, `spec.md > File Structure`, `spec.md > External Services and Dependencies`
  Build: Scaffold the web and worker folders, write era.js, qloo.js, llm.js and agent.js (understand, resolveSeeds, gather, compose, validateCard, fallbackCard), the router, and the page form and card rendering.
  Verify (mechanical): `node --test worker/test/` passes, including checks that every moment's year is in range, there are exactly five moments, and avoid terms are filtered. A headless browser run against the local helper with fakes renders five moments.
  Learner check: Open the page, press "Try an example", then **Make a session**, and see five moments from 1958 to 1978 with reasons.
  Commit: `Make a session card from tastes and memory years`

- [x] **2. "How did it go?" swaps moments**
  Becomes usable: Typing "she didn't know the Beatles one, she loved the dancing" replaces that moment with a dance song, marked new, with an updated reason.
  Why now: It is the second half of the core loop and the agentic part, and it reuses the tools from slice 1.
  PRD ref: `prd.md > Updating after a visit`
  Spec ref: `spec.md > Agent (worker/src/agent.js)`, `spec.md > The Core Journey Through the System` (steps 8-9)
  Build: Add `refine` (plan actions with the model, with a rule-based fallback, then run them with the Qloo tools), `/api/refine`, and the update box and "new" marks on the page.
  Verify (mechanical): Tests show that the flagged moment is removed, a replacement of the same kind is added, there are still five moments, and the replacement is marked `isNew`.
  Learner check: After making Joan's card, type the feedback and press **Update the session**, and see one moment change.
  Commit: `Refine the session from visit feedback`

- [ ] **3. Live, printable, and recorded**
  Becomes usable: The page is live on GitHub Pages and the helper on Cloudflare with the real Qloo key. Printing shows only the card. A demo video is recorded in CI.
  Why now: Judges need a live demo and a video. This also proves the real Qloo data, the open question in the spec.
  PRD ref: `prd.md > Printing`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > Where It Runs and How Someone Tries It`, `spec.md > Important Failure Modes`
  Build: Add print styles, the error and empty states, the CI and deploy workflows, the smoke script and the demo recorder.
  Verify (mechanical): The deploy workflow is green, the smoke script passes against the live helper (five moments, years in range, a non-empty trace), and the video artifact exists.
  Learner check: Open the live page on a phone and a laptop, make Joan's session, print a preview, and watch the video.
  Commit: `Deploy, print styles and demo recording`

## Hands-on Checkpoints

- [x] Early usable behavior explored — after slice 1, with a headless browser screenshot of the card
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: not started
Route and stops: not started
Edit outcome: not started
Reflection: not started
Activity mode: not started

## Revisions
- Slices 1 and 2 landed in one commit — the refine agent reused the same Qloo tools and tests, so building it alongside slice 1 cost little.
