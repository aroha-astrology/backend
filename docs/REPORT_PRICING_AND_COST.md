# Report Pricing & Cost Analysis

_What each of the 10 Reports costs us in AI compute vs. what we charge the user._

A quick glossary before the numbers: **LLM** = "Large Language Model," the AI (Google's Gemini, in our case) that writes each report's text. Every time we ask it to write something, that's one **LLM call**. The AI is billed per **token** — roughly ¾ of a word — split into _input_ tokens (what we send it: instructions + chart data) and _output_ tokens (what it writes back).

## 1. Executive summary

The AI cost to generate any one of our 10 reports is tiny — a few paise, well under 1% of what we charge for it. Even with a translation into Hindi/Bengali/Tamil/etc. added, it's still under 2%. That means **AI cost is not what determines our margin on reports** — two other things are:

1. **Google Play's cut** on real-money wallet top-ups (roughly 15-30%, depending on Play's pricing tier and whether it's a subscription or one-time purchase).
2. **The ₹500 free wallet balance every new signup gets.** A report "bought" with that free balance brings in ₹0 of real cash, even though it looks identical to a paid unlock in the reports table. The admin dashboard built in this same project deliberately splits "cash in" from "wallet spend" so we can tell these two apart — this document explains why that split matters.

## 2. Pricing table (all figures estimated — see Section 5 for what's actually measured today)

| Report                 | Price  | Billing  | LLM calls | Est. AI cost/report (English) | Est. AI cost (+1 translation) | Est. margin (cash basis\*) |
| ---------------------- | ------ | -------- | --------- | ----------------------------- | ----------------------------- | -------------------------- |
| Marriage               | ₹99    | one-time | **2**     | ₹0.08                         | ₹0.19                         | 99.9%                      |
| Past Life              | ₹25    | one-time | 1         | ₹0.04                         | ₹0.12                         | 99.8%                      |
| Kundli Milan           | ₹99    | one-time | 1         | ₹0.06                         | ₹0.15                         | 99.9%                      |
| True Love              | ₹99    | one-time | 1         | ₹0.04                         | ₹0.12                         | 100.0%                     |
| Wealth                 | ₹99    | one-time | 1         | ₹0.05                         | ₹0.12                         | 99.9%                      |
| Baby Name              | ₹99    | one-time | 1         | ₹0.04                         | ₹0.12                         | 100.0%                     |
| Health (monthly)       | ₹25/mo | monthly  | 1         | ₹0.03                         | ₹0.09                         | 99.9%                      |
| Career (monthly)       | ₹25/mo | monthly  | 1         | ₹0.03                         | ₹0.09                         | 99.9%                      |
| Finance (monthly)      | ₹25/mo | monthly  | 1         | ₹0.03                         | ₹0.09                         | 99.9%                      |
| Relationship (monthly) | ₹25/mo | monthly  | 1         | ₹0.03                         | ₹0.09                         | 99.9%                      |

_\*"Cash basis" = assumes the ₹99/₹25 was actually paid in cash, i.e. ignores the free-grant scenario in Section 3. Margin numbers round to "99.8%+" everywhere — the differences between rows are in the third decimal place and not meaningful given these are estimates, not measurements._

**On the LLM-call count** (confirmed by reading every one of the 10 generator files in `src/lib/llm/reports/*.ts`): Marriage is the only report that makes **2** separate AI calls (one for the headline score/band/timing, one for the 7th-house personality sketch + family outlook). Past Life and all 4 monthly reports (Health/Career/Finance/Relationship) make exactly **1** call each. The remaining reports we hadn't previously discussed — Kundli Milan, True Love, Wealth, Baby Name — also make exactly **1** call each.

**How the cost estimate was built** (since we don't yet measure cost per report type — see Section 5): for each report, we took the exact system-prompt text from the code, counted its characters, and converted to tokens at the standard "~4 characters per token" rule of thumb for English. We did the same for the small chunk of chart data ("facts") interpolated into each prompt — these run 100-560 characters, well within the "a few hundred characters" ballpark. Output length was estimated from each report's actual structure (number of sections x paragraphs x sentences), which for all 10 reports lands far below their 4,096-token technical ceiling — that ceiling is a safety margin against the AI running on too long, not a target length.

Pricing used: **$0.25 per 1 million input tokens, $1.50 per 1 million output tokens** (Gemini 3.1 Flash-Lite, our sole AI provider).

> **⚠️ Corrected 2026-08-03.** This document previously converted at a hardcoded **₹88/USD**. That rate was stale — the real rate was ~₹95.4 — so every rupee figure in the table above understates cost by roughly 8%. Three further corrections found in the same audit, all of which push real cost _up_, never down:
>
> 1. **FX is no longer hardcoded.** The admin dashboard fetches the live ECB rate (`frontend/lib/fx.ts`); this script takes `INR_PER_USD` as an env var. The figures in the table above have _not_ been recomputed and remain at the old rate — treat them as ~8% low.
> 2. **GST.** Google bills this account in INR and adds **18% GST** on top of the converted list price. Invoice cost is 1.18× any figure here. (Normally recoverable as input tax credit, so net cost is the ex-GST number.)
> 3. **Voice is not counted anywhere.** Gemini Live (`GEMINI_LIVE_MODEL`) runs over ephemeral tokens straight from the client and **never writes to `ai_usage`**. No voice spend appears in this doc, the script, or the dashboard.
> 4. **Thinking tokens — unresolved.** `gemini-3.1-flash-lite` has thinking **on by default** and Google bills thinking tokens as _output_ ($1.50/1M). Our code never sets `thinking_level`. Whether the OpenAI-compat `completion_tokens` we record includes them is undocumented and still unverified; if it excludes them, output tokens are undercounted on the 6×-priced side.

## 3. The free-signup-grant caveat (read this before judging "margin")

Every new signup gets **₹500 of free wallet balance** (`walletBalancePaise` defaults to 50,000 paise in the database — confirmed in code). That balance spends exactly like real money inside the app; the wallet doesn't know the difference between "topped up with a debit card" and "given away for free."

**Worked example:** A brand-new user, who never once pays real money, spends their ₹500 free balance on five ₹99 reports (₹495 total, ₹5 left over unspent). From the business's point of view:

- **Cash revenue collected: ₹0.**
- **Real AI cost for those 5 reports: roughly ₹0.20-0.40** (using the ₹99-tier reports' per-report cost range from the table above — cheapest is True Love/Wealth/Baby Name at ~₹0.04 each, priciest is Marriage at ~₹0.08 each).

So for a user who never tops up, **the ₹500 grant itself is the real cost of acquiring them — not the reports it bought.** The grant is roughly 1,000-2,500x larger than the AI cost of everything it funded. Report generation cost is a rounding error next to the size of the free grant.

**The practical takeaway:** "cost per report" and "cost of the free-user acquisition funnel" are two separate questions, and mixing them up makes reports look expensive when they aren't — the grant is expensive (₹500 per signup, no matter what they do with it), reports are cheap (a few paise each, whoever pays for them). The admin dashboard already built in this same project splits **cash-in** (real top-ups) from **wallet-spend** (any wallet debit, grant-funded or not) for exactly this reason — watching the gap between those two numbers over time is how to monitor how much of our "revenue" is actually just users spending free money.

## 4. Why a translated report costs about 2x an English one

Two compounding reasons, both visible directly in the code (`src/config/llm.ts`):

1. **Same token ceiling, bigger real job.** Both the English-writing profile (`REPORT_PROFILE`) and the translation profile (`REPORT_TRANSLATION_PROFILE`) are capped at 4,096 output tokens. But a translation call's _input_ isn't a short prompt — it's the **entire already-written English report**, re-sent to the AI so it has something to translate. That alone roughly doubles the input side of the bill compared to the original English-writing call.
2. **Non-Latin scripts need more tokens per word.** Hindi, Bengali, Tamil, Marathi, Gujarati, etc. routinely need around **2x as many AI tokens** to say the same thing as English does, because of how these scripts get broken into tokens internally. This is a documented, previously-observed pattern in this codebase (it's the same reason several other AI features — daily horoscopes, house insights — needed bigger token ceilings specifically for their translated versions, to avoid the AI's reply getting cut off mid-sentence). So the _output_ side of a translation call is also inflated, on top of the bigger input.

Put together: bigger input (full report re-sent) + inflated output (non-Latin script) is why "add one translation" roughly doubles a report's total AI cost in the table above.

## 5. What's NOT yet measurable

Every AI call in this codebase gets logged to an `ai_usage` table for cost tracking. But for the Reports feature specifically, that log only records the AI call's _purpose_ as `'report'` (writing in English) or `'report-translation'` (translating) — **it does not record which of the 10 report types triggered the call.** A ₹99 Marriage report call and a ₹25 Career report call both just show up as `agent: 'report'` in the log, indistinguishable from each other.

**What this means in practice:**

- We _can_ measure, today, the real total AI spend across _all_ reports combined (grouped by `report` vs `report-translation`) — the script in `scripts/report-cost-analysis.ts` does exactly this.
- We _cannot_ measure, today, the real AI spend for "Marriage reports" specifically vs. "Wealth reports" specifically. The per-report breakdown in the pricing table above (Section 2) is a **reasoned estimate from reading the code**, not something pulled from real usage logs.

**If precise per-report-type spend is ever wanted:** tag `ai_usage.agent` with the specific report key (e.g. `'report:marriage'` instead of just `'report'`) at the call site in each generator. This is a small, well-contained change — noted here as a suggestion only; it is **not** implemented as part of this task.

## 6. Recommendations

1. **Don't price reports based on AI cost — it's not the constraint.** Every report clears 99.8%+ margin on a cash-purchase basis. If a report's price ever needs to move, base it on what users are willing to pay or how it compares to competitors, not on protecting margin from AI cost.
2. **Confirm which Google Play commission tier we're actually on.** Play's cut (15% vs 30%, and different rules for subscriptions vs one-time purchases, plus a possible small-business threshold) is a real, certain cost on every rupee of top-up revenue — it dwarfs anything on the AI side and is worth double-checking against our actual account settings rather than assuming.
3. **Watch cash-in vs. wallet-spend as two separate numbers, not one "revenue" figure**, using the split the admin dashboard already has. The ₹500 free grant means a chunk of "reports sold" every month may represent ₹0 in real cash — conflating the two overstates how much money reports are actually bringing in.
4. **The ₹500 signup grant size is a growth/marketing lever, not a cost lever** — funding it costs the business the same ₹500 regardless of whether the user spends it on 5 reports or 20, since the AI cost of redeeming it entirely is well under ₹1 either way. If the grant feels too generous or too stingy, that's worth revisiting based on how it affects signups and later top-up behavior — not based on any AI-cost concern.
