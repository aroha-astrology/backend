# Aroha Astrology in Claude: submission checklist

Everything to list Aroha Astrology in Claude's Connectors Directory. Work top to bottom. Text in boxes is ready to paste.

- Connector address: `https://api.arohaastrology.in/mcp/claude` (no slash at the end)
- Help page: `https://api.arohaastrology.in/connectors/claude`
- Portal: https://claude.ai/directory/manage
- Anthropic's guide: https://claude.com/docs/connectors/building/submission

The ChatGPT plugin keeps its own address (`/mcp`) and is not affected by anything here.

## Before you start

1. The Claude account you submit from must be on a paid plan (Pro, Max, Team or Enterprise). On Team or Enterprise it must be an Owner.
2. The listing belongs to that account's organisation for good, so use the account the business should own it under.

## Part 1: try it in Claude first

Anthropic asks you to confirm you ran every tool yourself.

1. Open https://claude.ai/customize/connectors.
2. Add a custom connector. Name: `Aroha Astrology`. Address: `https://api.arohaastrology.in/mcp/claude`.
3. It should show **Connected** with no sign-in step. Open it and check **Tool permissions** lists 8 tools.
4. Start a new chat, open **+ > Connectors** and turn Aroha Astrology on.
5. Send each prompt below, one per message, and approve the tool when Claude asks.

| # | Prompt | What you should see |
|---|---|---|
| 1 | Make my Vedic birth chart and show it. I was born on 17 April 1990 at 2:30 pm in Pune, India. | Leo ascendant, Moon in Sagittarius, Purva Ashadha nakshatra, and the chart card drawn in the chat |
| 2 | What is my moon sign and nakshatra? I was born on 17 April 1990 at 2:30 pm in Pune, India. | Sagittarius, Purva Ashadha pada 3, lord Venus |
| 3 | Check the kundli match for someone born 17 April 1990 at 2:30 pm in Pune and someone born 3 November 1992 at 6:10 am in Jaipur. | 8.5 out of 36, Nadi Dosha and Bhakoot Dosha present |
| 4 | What is the panchang for Varanasi on 20 October 2026? | Shukla Navami, Shravana nakshatra, sunrise 06:04, sunset 17:21 |
| 5 | Find good dates for a housewarming in Pune between 1 and 30 November 2026. | Best dates led by 20 and 26 November 2026 |
| 6 | What is this week's horoscope for Sagittarius moon sign? | A weekly reading for Sagittarius |
| 7 | What are the numerology numbers for Asha Rao, born 17 April 1990? | Life path, Mulank, Bhagyank and name numbers |

Prompt 1 runs two tools (the chart, then the card), so these seven prompts cover all eight.

On the chart card, press **Open in Aroha**. Claude shows an "Open external link" box for a custom connector; that is expected. After the listing is approved it opens directly.

If the card does not appear, or anything else looks wrong, stop and send a screenshot before submitting.

## Part 2: the portal

Open https://claude.ai/directory/manage, select **Submit new**, then **MCP connector**.

### Step 1. Connection

Paste the address, or pick the custom connector you added in Part 1:

```
https://api.arohaastrology.in/mcp/claude
```

Leave "Users connect to different URLs" off.

### Step 2. Tools

Nothing to type. It should list 8 tools, all read-only, with no warnings about missing titles or annotations.

### Step 3. Listing

**Server name**

```
Aroha Astrology
```

**One-liner**

```
Vedic birth charts (kundli), kundli matching, panchang, auspicious dates, moon sign horoscopes and numerology, calculated by Aroha's own engine.
```

**Description**

```
Aroha Astrology brings Vedic (Jyotish) astrology into a Claude conversation. Give your birth date, time and place and it calculates your birth chart (kundli): the ascendant, the nine planets by sign, house and nakshatra, the Vimshottari dasha timeline, doshas and yogas, and draws it as a North Indian chart.

It can also:
- Check a kundli match between two people with the 36-point Ashtakoota system, including Nadi, Bhakoot and Mangal Dosha.
- Give the panchang for any date and city: tithi, nakshatra, yoga, karana, sunrise and sunset, Rahu Kaal, Abhijit Muhurta and choghadiya.
- Find auspicious dates for a housewarming, wedding, vehicle purchase, business or product launch, agreement, travel or puja.
- Give the daily, weekly, monthly or yearly horoscope for a moon sign.
- Work out numerology numbers from a name and date of birth.

Every figure is calculated by Aroha's own engine from the planets' positions, using the classical rules of Vedic astrology with the Lahiri ayanamsa and whole-sign houses. Claude explains the result; it does not work out the chart itself.

No account or sign-in is needed, and nothing you enter is saved. All eight tools only calculate: none of them creates, changes or deletes anything.

A birth chart needs the birth date, time and place. Without a birth time the ascendant and houses are not reliable, and the result says so. Places are matched from a built-in list of cities and towns, so a very small village may need the nearest town instead.

Readings are traditional astrology offered for reflection. They are not predictions of fact and not medical, legal or financial advice.
```

**Categories**: the portal shows its own list, which I could not see from outside. Pick the closest to lifestyle or entertainment. Do not pick health, finance or productivity.

**Documentation URL**

```
https://api.arohaastrology.in/connectors/claude
```

**Privacy policy URL**

```
https://www.arohaastrology.in/legal/privacy
```

**Support contact**

```
https://www.arohaastrology.in/support
```

If it asks for an email instead: `subir@arohaastrology.in`

**Icon**: upload `claude-connector/icon.png` (512 x 512).

**URL slug** (this can never be changed after publishing)

```
aroha-astrology
```

**Screenshots** (the connector has a chart card, so 3 to 5 are required). Upload these from `claude-connector/screenshots/`, each with its prompt:

| File | Prompt to enter with it |
|---|---|
| `1-birth-chart-pune.png` | Make my Vedic birth chart and show it. I was born on 17 April 1990 at 2:30 pm in Pune, India. |
| `2-birth-chart-jaipur.png` | Show the Vedic birth chart for someone born on 3 November 1992 at 6:10 am in Jaipur. |
| `3-birth-chart-chennai.png` | Draw the kundli for a birth on 26 January 2001 at 9:15 am in Chennai. |
| `4-birth-chart-london.png` | Show my Vedic chart. I was born on 12 August 1985 at 6:45 pm in London. |

These are the real chart card drawn from the live server's answers, 1200 px wide. They were rendered outside Claude. If you prefer, replace them with screenshots taken in Claude during Part 1, cropped to the card only (PNG, at least 1000 px wide, no prompt in the picture).

**Allowed link URIs** (if the form has this field)

```
https://app.arohaastrology.in
```

Do not add the Play Store. Anthropic only accepts sites you own and removes the rest.

### Step 4. Use cases

**Primary use cases**

```
1. Calculate a Vedic birth chart (kundli) from a birth date, time and place, and show it as a North Indian chart.
2. Check a kundli match between two people with the 36-point Ashtakoota system.
3. Look up the panchang for a date and city, and find auspicious dates for an occasion.
4. Get a moon sign horoscope or numerology numbers.
```

**What users need before they can connect**

```
Nothing. No Aroha account, no plan and no setup. For a birth chart the user gives a birth date, time and place in the conversation.
```

**Reads or writes data**: Reads only.

### Step 5. Company

- Company name: `Aroha Astrology`
- Website: `https://www.arohaastrology.in`
- Primary contact: your name and `subir@arohaastrology.in`

### Step 6. Authentication

Choose **No authentication**. Every tool works on details the user types in; there is no account behind it.

### Step 7. Data handling

- The underlying API: **your own** (first-party). The server at `api.arohaastrology.in` runs Aroha's own calculation engine and calls no outside service.
- Personal health data: **No**.
- Sponsored content: **No**.

### Step 8. Test & launch

**Test account and access instructions**

```
No account is needed. The connector has no sign-in and no user accounts, so there are no credentials to share.

To connect: add https://api.arohaastrology.in/mcp/claude as a connector. It connects with no authentication step and lists 8 read-only tools.

Prompts that exercise every tool:
1. "Make my Vedic birth chart and show it. I was born on 17 April 1990 at 2:30 pm in Pune, India." Runs generate_birth_chart, then show_birth_chart. Expect Leo ascendant, Moon in Sagittarius, Purva Ashadha nakshatra, and the chart card.
2. "What is my moon sign and nakshatra? I was born on 17 April 1990 at 2:30 pm in Pune, India." Runs find_moon_sign. Expect Sagittarius, Purva Ashadha pada 3.
3. "Check the kundli match for someone born 17 April 1990 at 2:30 pm in Pune and someone born 3 November 1992 at 6:10 am in Jaipur." Runs check_kundli_match. Expect 8.5 out of 36.
4. "What is the panchang for Varanasi on 20 October 2026?" Runs get_panchang. Expect Shukla Navami, Shravana nakshatra, sunrise 06:04.
5. "Find good dates for a housewarming in Pune between 1 and 30 November 2026." Runs find_auspicious_dates. Expect 20 and 26 November 2026 among the best dates.
6. "What is this week's horoscope for Sagittarius moon sign?" Runs get_moon_sign_horoscope.
7. "What are the numerology numbers for Asha Rao, born 17 April 1990?" Runs get_numerology_numbers.

Error handling to try: "Make a birth chart for 17 April 1990, 2:30 pm, Springfield" returns the places the name could mean, so the user can pick one.

Help page: https://api.arohaastrology.in/connectors/claude
```

Tick the box confirming you ran every tool (you did, in Part 1).

### Step 9. Compliance

Seven acknowledgments, all required. What is true for this connector:

| Acknowledgment | Our position |
|---|---|
| Directory guidelines | Read the two documents linked in the portal before ticking |
| First-party API usage | Yes, the server is Aroha's own, on Aroha's domain |
| Financial transactions | None. No tool moves money or sells anything |
| AI media generation | None. The chart card is drawn from the calculated positions; no image model is involved |
| Prompt injection | Tool descriptions only say what each tool does |
| Conversation data collection | The server receives only what a tool needs and saves none of it |
| Public documentation | The help page above |

### Step 10. Review and submit

Read the summary and submit. If it shows a warning about a very short answer, lengthen that answer before submitting.

## After you submit

- Anthropic scans the submission automatically and, by default, lists it as a **Community** connector. A person may review it too; there is no fixed time.
- Status and any feedback appear at https://claude.ai/directory/manage.
- Anthropic may later upgrade a listing to **Verified** on its own; there is nothing to apply for.
- For a stuck submission: `mcp-review@anthropic.com`.

## Things to know

- **The "more in Aroha" line.** Anthropic rejects connectors that tell Claude what to say or that promote a product in tool text. So on the Claude address the server no longer instructs Claude to point to the app. Every result still carries the Aroha link and the chart card still has the **Open in Aroha** button, but whether Claude mentions the app in its answer is now Claude's choice.
- **Android link.** Claude does not tell the server what device the user is on, so the link is always `app.arohaastrology.in`, never the Play Store.
- **Panchang without a city.** Claude sends no location hint, so "today's panchang" with no city uses New Delhi and says so.
- **Privacy policy.** The policy on the website does not mention Claude or ChatGPT. The help page covers what the connector handles. A short paragraph in the website policy would be stronger, and is still waiting for your yes.
- **Changing the address.** Do not change `/mcp/claude` after submitting; the listing is tied to it.
