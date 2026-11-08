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
- **Tri-Pataki verdict.** JHora draws the placements only. The 2027 placements are still to be copied for b01 and b03 to b10.
- **Gandanta.** JHora shows no Gandanta flag. `test/varshik-gandanta-sweep.spec.ts` restates BPHS chapter 92 independently and sweeps the whole zodiac (Moon, Abhukta Moola, tithi, Lagna) plus the 10 gold charts; the detector agrees everywhere.

## Unresolved fixture rows

Four KP sub lords recorded from JHora disagree with the Vimshottari subdivision worked out by hand: b04 Mercury (54.787), b09 Venus (130.589), b10 Mercury (313.600), b10 Venus (270.655). No ayanamsa shift fixes them (96 of 100 rows match at shift zero; none better at any other). They look like transcription slips. Re-read those four rows in the JHora KP tab, then empty `KNOWN_SUB_MISSES` in `test/varshik-jhora-natal.spec.ts`.
