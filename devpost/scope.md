---
doc: scope
status: approved
---

# Remembering Room

A helper that turns a few facts about an older person into a ready-to-run 30-minute reminiscence session: the songs, films, shows and books from their own youth that sit close to what they already love, each with a gentle conversation starter.

## The Unique Kernel
It is grounded in two things a chatbot can't give you on its own: the person's own tastes, expanded through Qloo's taste graph ("people who love Elvis and *The Sound of Music* also love…"), and their **reminiscence bump**, the years between about 10 and 30 when people form their most vivid memories. Every item comes from those years and has a stated reason for being there.

## Who It's For
Maya, 46, whose mother Joan (born 1948, grew up in Liverpool) has early-stage dementia. Maya visits on Sundays and wants the visit to be more than sitting with the TV on. Today she guesses at songs on YouTube and runs out of things to say after ten minutes.
Second user: an activities coordinator in a care home who has to plan sessions for several residents a week and doesn't know each one's era.

## The Core Loop
1. Enter a first name, birth year, where they grew up, and a few things they have always loved. Optionally, things to avoid.
2. Get a session card: five "moments" in a calm order, each with a year, why it was picked, two conversation starters and a link to find the song or clip.
3. After the visit, say how it went in a sentence ("she lit up at the dancing, didn't know the Beatles one"). The helper swaps or adds moments to match, and the next card is better.
They come back weekly because each session teaches the helper more about the person.

## Inspiration & Identity
Warm, unhurried, dignified. Feels like a well-made printed programme or a hymn sheet, not an app dashboard. Big readable type for older eyes and for printing. Soft paper tones, one warm accent colour. No "AI sparkle" styling.
References: reminiscence therapy practice (life story work, music and memory sessions), printed theatre programmes.

## Why This Matters to the Learner
bladoi asked for projects that do real good and can stand on their own. Around 57 million people live with dementia (WHO, 2021), and the people who visit them often feel at a loss for what to do together.

## What "Working" Looks Like
In the demo you type "Joan, born 1948, Liverpool, loved Elvis, *The Sound of Music* and dancing," press one button, and in a few seconds see a printable card with five moments from 1958 to 1978 that make sense for her, each explained. Then you type "she didn't know the Beatles one, she loved the dancing" and watch one moment get swapped for something more danceable, with the reason updated. That swap is the "oh, that's cool" beat.

## The POC Boundary
- One input form, one session card, one "how did it go?" box that refines the card.
- Music, films, TV and books.
- Qloo for every recommendation; a language model only for understanding the free text, ordering the moments and writing the conversation starters.
- Print-friendly card.
- A live demo that judges can open in a browser.

## Later
- Saving a person's profile and session history across visits.
- Several people's profiles for a care-home coordinator.
- Places from their youth (holiday destinations, local venues).
- Sharing a card with siblings.

## Explicitly Cut
- **Playing the music inside the app**: licensing; a search link is enough to prove the idea.
- **Accounts and logins**: not needed to prove the kernel, and they add privacy work.
- **Medical claims or assessments**: this is a conversation aid, not therapy, and it must never present itself as treatment.
- **Storing personal details on a server**: nothing about the person is kept after the card is made.
