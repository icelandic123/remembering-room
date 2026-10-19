---
doc: prd
status: approved
---

# Remembering Room — Product Requirements

A one-page web helper for family members and care-home activity staff that builds a 30-minute reminiscence session for an older person from their birth year, where they grew up and what they love.
Source: `scope.md > Who It's For`, `scope.md > The Core Loop`.

## The Core Journey
1. Maya opens the page. She sees a short line on what it does and a form with four fields: what to call them, birth year, where they grew up, and "a few things they've always loved". A fifth, optional field says "anything to steer clear of".
2. She fills it in ("Joan", 1948, "Liverpool, England", "Elvis, The Sound of Music, dancing, Coronation Street") and presses **Make a session**.
3. A calm progress line names the steps as they happen: reading what she loves, finding them in Qloo, looking across Joan's younger years (1958 to 1978), putting the session together.
4. A session card appears: a title ("Sunday with Joan"), her memory years, and five numbered moments. Each moment shows: what kind it is (song, film, TV, book), the title, the year, a one-line reason ("Loved by fans of Elvis and popular with Joan's generation"), two conversation starters, and a **Find it** link.
5. Maya prints the card or keeps it open on her phone during the visit.
6. Afterwards she writes in **How did it go?**: "She didn't know the Beatles one. She loved anything she could dance to." She presses **Update the session**.
7. The card updates in place: the moment she flagged is replaced, the new one is marked "new", and the reason mentions what she said. The progress line shows what the helper did ("swapped moment 3 for a dance song from 1962").

## Screens and Layout
One page, top to bottom: header with name and one-line purpose; the form; the progress line (only while working); the session card; the "How did it go?" box under the card. On a phone everything stacks in one column. Printing shows only the card.

## Look and Feel
Warm paper background, dark ink text, one muted warm accent (brick or rose). A serif for headings and a highly readable sans for body text, at large sizes (body at least 18px). Generous spacing and clear numbered moments, like a printed programme. No gradients, glows or robot imagery. Copy is plain, kind and short. It never says "patient".
Source: `scope.md > Inspiration & Identity`.

## Features and Behavior

### Making a session
Implements `scope.md > The Unique Kernel`.
- As a family member, I want a session built from my mum's own tastes and years so that it feels like her, not a generic oldies list.
  - [ ] Every moment's year falls inside the memory years shown on the card (birth year + 10 to birth year + 30), except songs, which come from artists she loved or artists active then.
  - [ ] At least one moment is directly one of the things she listed, or by the same artist, so she recognises something early.
  - [ ] The other moments come from Qloo recommendations seeded by what she loves, and each says why.
  - [ ] There are exactly five moments, in this order: a familiar opener, a film or TV memory, a "tell me about" moment, a sing-along, and a gentle closer.
  - [ ] Each moment has two open conversation starters that invite a story (not quiz questions like "what year was this?").
  - [ ] Anything in "steer clear of" never appears, nor anything obviously tied to it.

### Updating after a visit
Implements `scope.md > The Core Loop` step 3.
- As a family member, I want to say how it went in my own words so that the next session fits better.
  - [ ] Free text such as "she didn't know X" removes X and adds a replacement of the same kind.
  - [ ] "She loved Y" adds Y's flavour to the replacement's Qloo seeds.
  - [ ] Changed moments carry a small "new" mark and an updated reason.
  - [ ] The card keeps five moments.

### Printing
- [ ] Print shows only the card, black on white, on one or two A4/Letter pages.

## States and Boundaries
- **First visit**: empty form with example text in placeholders and a "Try an example" link that fills in Joan.
- **Working**: the button is disabled and the progress line advances. It takes a few seconds.
- **Not enough to go on**: if nothing she listed can be found, the card still builds from her years and generation, and says "We couldn't find X, so this one leans on her generation's favourites."
- **Service trouble**: if the recommendation service fails, show a plain message ("We couldn't reach our music and film library. Please try again in a minute.") and keep what she typed.
- **Privacy**: nothing typed is stored after the card is made. The page says so in one line.
- **Birth year out of range**: years before 1925 or after 1990 get a gentle note asking to check, because the tool is aimed at older adults and the data thins out at the extremes.

## Product Decisions
- Five moments, not ten. A visit runs about 30 minutes, and five gives time to talk.
- Memory years are birth year + 10 to + 30, after the reminiscence-bump research. They are shown on the card so carers understand the choice.
- A "find it" search link instead of embedded playback, to keep licensing clean.
- Conversation starters ask for stories and feelings, never test memory, because quizzing can distress people living with dementia.
- No accounts, and nothing is stored: simpler and kinder for a proof of concept.

## What We're Building
The form, the session card with five moments, the progress line, the "How did it go?" update, the example link, print styles, and a live server that talks to Qloo and a language model.

## Deferred From the POC
- Saved profiles and history (needs storage and privacy work).
- Several residents for a coordinator (needs accounts).
- Places and destinations (adds a second kind of input).

## Possible Later Enhancements
- A large-text "show to them" mode for a tablet.
- A photo prompt moment ("bring a photo from this year").

## Non-Goals
- Not a medical tool and makes no health claims.
- Not a music player.
- Not a general recommendation app for any age.

## Open Questions
- How well Qloo covers older films and UK TV. This is checked in the first build slice and can wait for `4-spec`.
