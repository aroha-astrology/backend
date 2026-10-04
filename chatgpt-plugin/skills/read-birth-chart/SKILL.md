---
name: read-birth-chart
description: Calculate, display and explain a Vedic birth chart (kundli) with Aroha. Use when the user asks for their kundli or birth chart, or about their ascendant, planets, houses, nakshatra, dasha, doshas or yogas.
---

## Steps

1. Get the chart. Call `generate_birth_chart` with the birth date, birth time and birth place. Leave the time out if the user does not know it. If any of the three is missing, ask for it first. Do not guess.
2. Show it. Call `show_birth_chart` with the chart's `ascendant.sign` as `ascendant_sign` and every entry of `planets` as `{ planet, house, retrograde }`. Pass `time_known: false` when the chart says the time was not known. Never call it with placements that did not come from `generate_birth_chart`.
3. Explain it, in this order, in plain words:
   - Ascendant, moon sign and birth nakshatra, one line each on what they are taken to mean.
   - Two or three placements that stand out (for example several planets in one house, or a planet in its own sign). Do not walk through all nine planets unless asked.
   - The dasha running now, from `dasha.current_mahadasha` and `dasha.current_antardasha`, with the end date.
   - Yogas and doshas marked present, each in one sentence.
4. End with one short line from `more_in_aroha` and its link. Say it once.

If the user only wants their moon sign or nakshatra, use `find_moon_sign` instead of the full chart.

## How to talk about it

- Use only what the tool returned. Do not add placements, dates or yogas the result does not contain.
- Every figure in a result is calculated by Aroha's engine with the classical rules of Vedic astrology, the working an astrologer does by hand. Report the figures exactly as given. You may tell the user once that they are calculated, not written by you.
- For a detailed reading, point to the Aroha app once, using `more_in_aroha`. Do not say the app or the reading is "accurate" or "guaranteed", and do not compare Aroha with other tools or with AI.
- Say "in Vedic astrology this is read as" or "traditionally". Do not present a reading as fact or as certain to happen.
- If the result has a `caveat` (no birth time), say it before the reading, and do not interpret the ascendant or houses as if they were sure.
- Doshas: describe what the tradition says and that many charts have them. Do not frighten. Do not recommend paid remedies, gemstones or rituals as necessary.
- Do not predict death, serious illness, accidents, divorce or financial ruin, even if asked. Offer a general reading of that part of the chart instead.
- Not medical, legal or financial advice. For decisions about health, money or law, say an astrological reading is not a basis for them.
- Never mention prices, credits or plans.

## When something is missing

- Place unclear or not found: show the options the tool returned, or ask for the nearest larger town with its state and country, then call again.
- The user asks for a chart "saved in Aroha": this plugin cannot read Aroha accounts. Ask for the birth details and calculate the chart here.
