# JHora reference fixtures (Varshik C0)

Real Jagannatha Hora output, transcribed by hand. Settings: Traditional Lahiri, mean nodes, exact solar motion, sidereal solar year.
`test/varshik-jhora-b01.spec.ts` compares the engine with these files at JHora's own return instant.

## Deliberate divergences (owner decisions, 2026-11-07)

- **Solar return time.** JHora uses mean-equinox geometric Sun positions; the engine uses nutated positions to match Drik Panchang. b01: engine is 2 m 44 s late in 2026 and 42 s late in 2027. Lagna is compared at JHora's instant.
- **Mudda Vimshottari.** JHora runs it from the birthday/Moon balance. The engine anchors it exactly at each solar return (exact seam). Kept.
- **Panchavargiya.** JHora uses natural friendship. The engine uses Tajika friendship by house (Tajika Neelakanthi verse 41). Kept. Year Lord is not in JHora, so it stays unverified.
- **Saham +30 rule.** Not a divergence: the engine now follows JHora (exact longitude, ends not counted).
- Tajika yogas, Year Lord and the Tri-Pataki verdict are not printed by JHora: unverified.
