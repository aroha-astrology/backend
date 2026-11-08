# JHora reference fixtures (Varshik C0)

Real Jagannatha Hora output, copied by hand. Settings: Traditional Lahiri, mean nodes, exact solar motion, sidereal solar year.

| File | What it holds | Checked by |
|---|---|---|
| `b01..b10.partial.json` | 2026 and 2027 Varsha: return, Lagna, Muntha, 36 Sahams, Panchavargiya, Harsha, Dwadashavargiya, Mudda Vimshottari, Mudda Yogini, Patyayini, Tri-Pataki placements | `test/varshik-jhora.spec.ts` (Lagna, Muntha, 8 Sahams) |
| `b01..b10.natal.json` | natal longitude, nakshatra, pada, star lord, KP star and sub lord for the Lagna and 9 bodies | `test/varshik-jhora-natal.spec.ts` |
| `drik-moon-nakshatra-2027.json` | 9 Moon nakshatra changes in 2027 read from drikpanchang.com (New Delhi) | `test/varshik-drik-nakshatra.spec.ts` |
| `transits-2027.json` | SUPERSEDED. Hand-copied planet changes, incomplete. | nothing |

## How checking works (owner, 2026-11-08)

JHora is the referee for astrology rules. Planet movement is checked by machine:

- `test/varshik-sky-events-2027.spec.ts`: every 2027 sign change, station and nakshatra change of the Sun, Mercury, Venus, Mars, Jupiter, Saturn, Rahu and Ketu, against `scripts/ephemeris-check/events_2027.py` (native pyswisseph, its own event finder); the five 2027 eclipses against NASA's table (times there are TD, so the test takes the 68.8 s ΔT off); and the Sun leaving Dhanu at 09:14 PM IST on 14 Jan 2027, as drikpanchang prints it.
- `test/varshik-pyjhora.spec.ts`: the engine against PyJHora on the 10 gold charts and 300 seeded synthetic charts.

Both skip unless `PYJHORA_PYTHON` points at a Python 3.11 with `pyswisseph` (and `pyjhora==4.8.7` for the second); setup is in memory `pyjhora-runnable`.

## Known differences (JHora or Drik wins; none is an engine bug)

- **Ayanamsa.** The engine uses Swiss Ephemeris mode 44 (Lahiri VP285), which is 23 arcseconds ahead of standard Lahiri (mode 1). JHora "Traditional Lahiri", PyJHora and standard Swiss Lahiri all use mode 1. Drik Panchang agrees with the engine: it prints the Sun leaving Dhanu at 09:14 PM IST on 14 Jan 2027; mode 44 gives 21:15, mode 1 gives 21:06. This is why the engine's Lagna is a constant 0.006 degrees from PyJHora's and why its sign and nakshatra changes run 9 minutes (Sun) or more later than a mode-1 run. Do not change it: it is shared by every Aroha screen and matches the panchang the app copies.
- **Solar return time.** JHora uses mean-equinox geometric Sun positions; the engine uses apparent (nutated, aberrated) positions. Engine minus JHora ranges from about minus 12 to plus 3 minutes across the gold charts. Lagna is compared at the reference's own return instant, which removes the gap. PyJHora is 10 to 25 seconds later than JHora on the return and about 3 arcminutes off on the Varsha Lagna (a solar-motion setting).
- **PyJHora year skip.** For an old birth whose true return falls a day or more after the calendar anniversary, PyJHora returns the following year's return (2 of 300 synthetic charts, s067 and s279). The engine's Sun is back on its natal longitude in both.
- **Mudda Vimshottari.** JHora runs it from the birthday and Moon balance; the engine anchors it exactly at each solar return (exact seam). Owner decision: keep ours.
- **Panchavargiya.** JHora uses natural friendship; the engine uses Tajika friendship by house (Tajika Neelakanthi verse 41). Owner decision: keep ours.
- **Saham +30 rule.** Settled by the fixtures: the test is by exact longitude with the ends not counted, and Karyasiddhi tests the Lagna. All 8 Sahams the engine has match JHora on 9 charts and both years (160 values: 10 charts, 2 years, 8 Sahams). PyJHora differs on this rule: against it the five Sahams Punya, Vidya, Rajya, Putra and Vivaha are either equal or exactly 30 degrees apart, and Pardesh, Artha and Karyasiddhi differ in about one chart in nine (ceilings in the test).

## Not shown by JHora, checked elsewhere

- **Year Lord.** The engine's pick agrees with PyJHora `lord_of_the_year` on only 54 of 307 charts. The two use different rules (PyJHora's is a benefic-aspect shortlist, ours is Tajika Neelakanthi verses 64 to 67 with Panchavargiya), so no side is confirmed. M.S. Mehta's worked examples were NOT obtained: the book is a 266-page PDF and only the first part could be read. Still open: check the Year Lord against two or three worked examples in Mehta before trusting it.
- **Tajika yogas (Ithasala, Ishrafa, Radda).** PyJHora finds more yogas than the engine on 172 of 318 charts and fewer on 17 (mean overlap 0.69). The difference is in the orb and aspect rules, not in noise. JHora does not print them, so this is unresolved. Same Mehta check needed. (Nakta, Yamaya, Kamboola are not compared: PyJHora's output for them could not be put in the same form.)
- **Tri-Pataki.** JHora draws the placements only and prints no verdict, so the verdict stays unverified. The placements (2026 and 2027, all 10 charts) are recorded, and the sign of every planet equals the engine's sign at the same instant (`test/varshik-jhora.spec.ts`; a planet within 0.05 degrees of a sign edge is skipped).
- **Gandanta.** JHora shows no Gandanta flag. `test/varshik-gandanta-sweep.spec.ts` restates BPHS chapter 92 independently and sweeps the whole zodiac (Moon, Abhukta Moola, tithi, Lagna) plus the 10 gold charts; the detector agrees everywhere.

## Unresolved fixture row

The four KP sub lords that first disagreed were re-read in JHora (`b04.kpfix.json`, `b09.kpfix.json`, `b10.kpfix.json`, each with the neighbouring rows). Three were transcription slips and are corrected in the natal files (b04 Mercury Ra, b09 Venus Sa, b10 Venus Ra). The engine's star, sub and Prati-sub now equal JHora's on every row read.

One row stays open: **b10 Mercury (313.600)**. JHora prints sub lord Ra, but its own Prati-sub on that row is Ma, which only fits a Mercury sub (engine: Mercury sub, Mars Prati-sub). The row was read twice with the same result. Pinned as `KNOWN_SUB_MISSES` in `test/varshik-jhora-natal.spec.ts`. Either JHora differs here or the same column was misread twice; a look at the KP tab with a second pair of eyes would settle it, but it does not block anything.

## C2 evidence (2026-11-08): Year Lord and Tajika yogas against M.S. Mehta

Source: M.S. Mehta, *Annual Horoscope (Varshaphala)*, ch. V-X (`test/varshik-mehta.spec.ts` holds his worked examples).

**Year Lord.**
- Mehta's rule: of the five office bearers, the strongest by Panchavargiya bala that looks at the Varsha Lagna; if none looks, the Muntha lord; if the strongest is under 5 and none looks, the Muntha lord; a tie goes to the planet holding more of the five roles; the Moon is normally passed over.
- The engine's Panchavargiya bala equals his worked table: Nehru 1946-47, kshetra, uccha, hadda and drekkana on all 7 planets; Year Lord strengths for Rajiv Gandhi 1984 (Sun 14.35 vs 14.23), V.P. Singh 1989 (Moon 13.63 vs 13.62) and 1990 (Mercury 14.60 vs 14.51). One rule differs: he gives full navamsa marks to a planet whose navamsa sign is its sign of exaltation (the Moon in Taurus); the engine, which reads the navamsa lord only, gives 1.25 instead of 5.
- PyJHora's `lord_of_the_year` is wrong in four places, which is why it agrees with the engine on only 54 of 307 charts: it counts the Muntha from the Varsha Lagna instead of the natal Lagna; where it falls back to Panchavargiya it returns the candidate's position in its list instead of the planet; it casts the chart at birth + age x sidereal year, not at the true return; its Panchavargiya uses natural friendship and the Parashari D-3.
- Engine defect found (NOT yet changed, owner to decide): when one planet holds two of the five roles and is the strongest, the engine treats the two roles as a tie and returns the Muntha lord. On 300 seeded charts that is 76 wrong picks (115 charts have a double-role top planet). Smaller differences from Mehta: Moon chosen as Year Lord on 32 of 300 (he passes it over, though his own V.P. Singh 1989 example has the Moon); no candidate looks at the Lagna: Mehta takes the Muntha lord, the engine the strongest (5 of 300).

**Tajika yogas.** The engine's orbs (mean of the two deeptamsha) and aspect rule (none at 2/12 or 6/8) are Mehta's. PyJHora finds more yogas because it counts the 2nd and 12th place as an aspect ("semi-sextile"), which Mehta rules out with a worked example (p. 130). Engine unchanged.

**Fixed in C2 (JHora wins):** the Mudda start lord was one place out on all 20 gold chart-years. The rule is now (nakshatra + completed years - 1) mod 9, which equals Mehta's and JHora's first lord on 20 of 20.

**Built and checked against the gold set:** Patyayini (lords in JHora's order on 20 of 20, bar a 0.003 degree near-tie; cut points within 4.5 days, the wander is unexplained), Harsha bala 140 of 140, Dwadashavargiya bala 100 of 100 for Sun, Mars, Jupiter, Venus, Saturn and 5 of 40 for Moon and Mercury (flagged `jhoraVerified: false`), 20 life Sahams plus Roga 21 of 21 on all 20.

**Adopted by the owner on 2026-11-08 (engine changed):** Mehta's Year Lord rules (a planet holding more of the five roles wins a tie; none looks at the Lagna -> Muntha lord; the Moon passed over except in his two cases, with the Ithasala partner or Moon-sign lord when only the Moon looks), and full navamsa marks when the navamsa sign is the planet's exaltation sign. The weights need re-calibration in C3.

**Mudda Yogini start lord, found (2026-11-08):** (nakshatra + (completed years mod 43) - 1) mod 8 equals JHora on all 20 chart-years; no other variant tried does (a wrap at 51 gives 16, the book's rule 0, a true natal-Yogini continuation 3). The wrap at 43 is empirical (ages 26 to 57 recorded); ages above 57 are unverified.

**Tri-Pataki vedha, found (2026-11-08):** PyJHora's `Tripataki` figure (`jhora/ui/chakra.py`) joins each place to three others; counted in houses from the Varsha Lagna it reproduces Mehta's reading of the Nehru chart on both points (Moon pierced by Rahu, Ketu and Saturn; Lagna by Mercury and Venus; Jupiter, Sun, Mars neither). No combined verdict: Mehta gives none, so the reading lists the piercings of the Lagna and the Moon in plain words. Not yet confirmed on JHora's own Tripataki screen (one screenshot of one gold chart would do it).

**Still not matched:** Dwadashavargiya bala for the Moon and Mercury. Tried: PyJHora's rule (Moon 2 of 20, Mercury 3 of 20), four D-2 methods, natural, compound and Tajika friendship, three counting rules: best 3 of 20 for the Moon and 6 of 20 for Mercury. A fit by sign lord gives Mercury = own sign + Venus's + Saturn's signs (19 of 20, Sun's signs not counted) but nothing clean for the Moon. Both stay out of scoring (`jhoraVerified: false`). To settle it: a screenshot of JHora's Dwadasa-vargeeya detail (the per-varga Benefic / Neutral / Malefic table, as in Mehta's Indira Gandhi exercise) for one gold chart, e.g. b01 2026.
