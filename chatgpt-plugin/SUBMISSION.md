# Submitting Aroha Astrology to the ChatGPT plugin directory

Everything you need to put the plugin in front of OpenAI's reviewers: what to set up once, what to upload, and the exact text to paste into each box. Follow it top to bottom. OpenAI's own guide is at https://developers.openai.com/plugins/deploy/submission.

The plugin has no sign-in. It does not touch the Aroha app, website or accounts: it is one new endpoint on the API that calculates and answers.

## What gets submitted

| Piece | Where it lives | Who provides it |
|---|---|---|
| Plugin ZIP (listing text, icons, 3 skills, test cases) | `chatgpt-plugin/dist/aroha-astrology-plugin-1.0.0.zip`, built by `npx tsx scripts/build-chatgpt-plugin.ts --demo-url <link>` | Built from this repo |
| The server ChatGPT talks to | `https://api.arohaastrology.in/mcp` | Live once the backend is deployed |
| Privacy policy, terms, support page | `https://www.arohaastrology.in/legal/privacy`, `/legal/terms`, `/support` | Already live |
| Demo video link | Unlisted YouTube or a Drive link anyone can open | You record it (shot list below) |
| Domain token | A text token the OpenAI dashboard shows you | You copy it, it goes on the server |

Reviewer login: not needed. No tool requires an account.

## One-time setup, before you open the dashboard

1. **Verify the business on OpenAI.** platform.openai.com → Settings → Organization → General → complete **business verification** under the name you want shown in the directory. The directory uses that verified name, whatever the ZIP says. The privacy policy and terms pages must name the same business, or review fails with a publisher mismatch.
2. **Use a project with global data residency.** Projects set to EU data residency cannot submit plugins. If yours is EU, create a new project in the same organization.
3. **Check you can submit.** Organization owners can. Anyone else needs the **Apps Management Write** permission.
4. **Deploy the backend.** Merging the `feat/chatgpt-plugin` branch to `main` deploys it automatically (there is no database change). Check: `https://api.arohaastrology.in/mcp` answers a POST, and a GET returns "Method not allowed".
5. **Try it yourself first.** In ChatGPT: Settings → Security and login → turn on **Developer mode**. Then chatgpt.com/plugins → plus button → add `https://api.arohaastrology.in/mcp` with no authentication. Run the eight prompts below, on the web and on your phone. Fix anything that looks wrong before submitting.

## Dashboard steps

1. **Upload.** platform.openai.com/plugins → **Upload new or existing plugin** → choose the verified business as Developer identity → **Upload plugin** → pick the ZIP.
2. **Metadata & Skills.** Wait for the checks. If it lists issues, press **Copy issues** and send them to whoever maintains this repo; the fix is made here and a new ZIP uploaded. The skill safety scan can take up to 2 hours.
3. **MCPs → select `aroha` → Connect.**
   - MCP Server URL: `https://api.arohaastrology.in/mcp`
   - Authentication: **None**.
4. **Domain verification.** The dashboard shows a token and a URL ending in `/.well-known/openai-apps-challenge`. Put the token in the server `.env` as `OPENAI_APPS_CHALLENGE_TOKEN=<token>`, restart the API (`pm2 reload aroha-api`), check that `https://api.arohaastrology.in/.well-known/openai-apps-challenge` shows exactly the token and nothing else, then press **Verify**.
5. **Tool scan.** Wait for it to finish. It should list 8 tools, all marked read-only.
6. **Review information → Review details.**
   - Test cases, release notes and the demo video link come from the ZIP and are read-only.
   - Reviewer credentials: none. If the box is required, write: "No sign-in. All tools work without an account."
   - Annotation justifications: paste from the table below, one per tool.
   - Iframe / frame domains: none. The chart card embeds nothing.
   - Screenshots: none are included. If the dashboard insists, ask for them: OpenAI wants one per starter prompt, exactly 706 px wide.
   - **Save details.**
7. **Submit for review.** Select the draft → **Submit for review** → tick the policy attestations. Status shows on the Plugins page; feedback comes by email. Review time is not published and cannot be sped up.
8. **Publish.** After the approval email, open the approved version → **Publish plugin**. It is then findable by name in the directory.

## Annotation justifications (paste per tool)

All eight tools are marked `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`.

| Tool | Justification |
|---|---|
| `generate_birth_chart` | Read-only: calculates a chart from the birth details given and returns it; nothing is saved. Not destructive: no data is changed. Not open-world: uses Aroha's own calculation engine and a bundled place list, with no web search or third-party call. |
| `find_moon_sign` | Read-only: calculates the Moon's position at birth and returns it; nothing is saved. Not destructive. Not open-world: own engine and bundled place list only. |
| `check_kundli_match` | Read-only: calculates a compatibility score from two sets of birth details and returns it; nothing is saved. Not destructive. Not open-world: own engine only. |
| `get_panchang` | Read-only: calculates calendar details for one date and place. Not destructive. Not open-world: own engine and bundled place list only. |
| `find_auspicious_dates` | Read-only: scores the days in a date range from the panchang and returns them; nothing is saved. Not destructive. Not open-world: own engine only. |
| `get_moon_sign_horoscope` | Read-only: returns a reading computed from current planetary positions for a zodiac sign. Not destructive. Not open-world: own engine only. |
| `get_numerology_numbers` | Read-only: arithmetic on a name and a date; nothing is saved. Not destructive. Not open-world. |
| `show_birth_chart` | Read-only: draws the placements it is given as a chart card and returns them unchanged. Not destructive. Not open-world: the card loads nothing from the network. |

## Demo video: what to record

One screen recording, 3 to 5 minutes, no editing needed. Record on chatgpt.com in a browser, then repeat prompt 1 in the ChatGPT phone app (OpenAI checks both). Upload as unlisted YouTube or a Drive link set to "anyone with the link", then build the final ZIP with that link:

```
npx tsx scripts/build-chatgpt-plugin.ts --demo-url https://youtu.be/XXXXXXXX
```

Say out loud, or show on screen, which prompt you are running.

1. `Make my Vedic birth chart and show it. I was born on 17 April 1990 at 2:30 pm in Pune, India.` Shows the chart card (Leo ascendant) and an explanation.
2. `Check the kundli match for a groom born 17 April 1990 at 2:30 pm in Pune and a bride born 3 November 1992 at 6:10 am in Jaipur.` Shows 8.5 of 36 with the koota table.
3. `What is the panchang for Varanasi on 20 October 2026?` Shows Shukla Navami, Shravana, sunrise 06:04, Rahu Kaal 14:31 to 15:56.
4. `Find good dates for a housewarming in Pune between 1 and 30 November 2026.` Shows best dates (20 and 26 November first) and dates to avoid.
5. `What is my moon sign and nakshatra? I was born on 17 April 1990 at 2:30 pm in Pune, India.` Shows Sagittarius, Purva Ashadha pada 3.
6. `Buy me more Aroha credits and upgrade my Aroha Pass.` It says this cannot be done here and shows no prices.
7. `Based on my chart, tell me which disease I will get and the year I will die.` It declines.
8. `Delete my Aroha account and all my saved profiles.` It says this is done in the Aroha app.

Before recording, run all eight yourself. If any answer differs from the "expected" text in `plugin.json`, stop: either the server or the expected text needs fixing first, because reviewers compare the two.

## Listing, as it will appear

- Name: Aroha Astrology
- Subtitle: Vedic kundli, match, panchang
- Category: Entertainment (the list has no astrology or lifestyle category; "Other" is the alternative, changed in `plugin.json`)
- Starter prompts: "Make my Vedic birth chart. I was born on 17 April 1990 at 2:30 pm in Pune." / "What is today's panchang for Varanasi?" / "Find good dates for a housewarming in Pune next month."
- Countries: all (no restriction set)
- Commerce: none. The plugin never shows prices, credits or plans and never links to a checkout. OpenAI does not allow selling digital goods through a plugin, so keep it that way in any later change.
- Link to Aroha: every answer carries one "more in the Aroha app" line. Android devices get the Play Store link, everything else gets `https://app.arohaastrology.in`.

## Privacy policy: one thing to decide

OpenAI checks that the privacy policy covers what the plugin handles. The current policy at `/legal/privacy` already names birth details and other people's birth details for matching, but it is written about the app and does not mention ChatGPT. Adding a short "Aroha in ChatGPT" paragraph there (what is received, that nothing is stored, that it is not shared) removes the most common reason for a privacy rejection. It is a text change on the website only.

## After it is published

- **Tool changes** (new tool, changed description or inputs): deploy the backend, then in the dashboard MCPs → Issues → **Rescan**. OpenAI also rescans daily. New or changed tools go live once they pass automated checks; no new ZIP.
- **Listing text, icons or skills**: change them here, raise `version` in `plugin.json`, build a new ZIP, upload it to the same plugin ("Upload plugin to make changes"), and submit that version for review.
- **Never change** the server address `https://api.arohaastrology.in`. OpenAI ties the plugin to that origin; a different one means submitting a new plugin.
- Before any press release about the plugin, OpenAI asks you to write to press@openai.com.

## If review comes back with a problem

| What they say | What it usually means here |
|---|---|
| Could not connect to the server | The API was down or `/mcp` was not deployed. Check `https://api.arohaastrology.in/healthz`. |
| A test case did not match | The answer changed since the expected text was written (for example the running dasha moved on). Rerun the five prompts, update `expected_behavior` in `plugin.json`, rebuild, resubmit. |
| Returns data not in the privacy policy | Add the "Aroha in ChatGPT" paragraph described above, or remove the field they name from the tool result. |
| Annotation does not match behaviour | A tool started saving or sending something. Every tool here must stay read-only, or its `readOnlyHint` must change in the code (not in the justification text). |
| Location input flagged | The `birth_place` and `place` inputs are places the user names (a birth town, a city to calculate for), not the user's own location. Appeal with that explanation. |
