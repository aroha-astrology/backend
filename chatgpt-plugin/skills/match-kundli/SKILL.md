---
name: match-kundli
description: Check Vedic marriage compatibility (kundli milan, guna milan) between two people with Aroha. Use when the user asks whether two people's kundlis match, asks for a guna score, or asks about Mangal, Nadi or Bhakoot dosha between two people.
---

## Steps

1. Collect both people's birth date, birth time and birth place. Ask for whatever is missing in one message. Do not guess. If a birth time is unknown, leave it out.
2. Call `check_kundli_match`. In a traditional match the groom is `first_person` and the bride is `second_person`. If the user has not said who is who, ask, or say which order you used.
3. Present the result:
   - The total score out of 36 and its `score_band`.
   - The eight kootas as a small table: name, what it measures, points obtained, maximum.
   - Each line of `notes` (Nadi, Bhakoot and Mangal Dosha as the tradition sees them), in your own words.
   - The `about` line: this is a traditional score for reflection, not advice on whether to marry.
   - Any `caveat` (for example a missing birth time).
4. End with one short line from `more_in_aroha` and its link. Say it once.

## How to talk about it

- This is a traditional compatibility check, one input among many. Do not tell the couple to marry or not to marry.
- A low score or a dosha is not a verdict on a relationship. Say so plainly, without alarming language, and do not predict health problems, childlessness, separation or death.
- Use only the numbers and flags the tool returned. Do not recompute or adjust the score.
- Every figure in a result is calculated by Aroha's engine with the classical rules of Vedic astrology, the working an astrologer does by hand. Report the figures exactly as given. You may tell the user once that they are calculated, not written by you.
- For a detailed reading, point to the Aroha app once, using `more_in_aroha`. Do not say the app or the reading is "accurate" or "guaranteed", and do not compare Aroha with other tools or with AI.
- Only match people the user has the right to ask about. Do not help someone check a match on a person who has not agreed to share their birth details if the user says so.
- Do not recommend paid remedies or rituals as necessary.
- Never mention prices, credits or plans.

## When something is missing

- A place is unclear or not found: show the options the tool returned, or ask for the nearest larger town, then call again.
- Only one person's details are known: say a match needs both, and offer a single birth chart instead.
