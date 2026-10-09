# D — Source Register

> Every passage that has actually been opened during this audit.
> A row is written ONLY when the text has been opened and the passage read.
> Nothing is cited from memory.

**Format:**

- **Id** — short opaque id, referenced from B-accuracy-matrix and provenance.ts
- **Text** — name of the original work
- **Edition** — publisher, editor, year used
- **Chapter / Verse** — as given in the edition
- **URL** — where it was read (GRETIL, archive.org, etc.)
- **Date read** — ISO date when this row was written
- **Quote** — the relevant passage (original language + translation if used)
- **Supports** — feature id(s) this passage is evidence for

---

> When a feature check finds no verifiable passage, the matrix entry is marked
> `ANCIENT SOURCE NOT VERIFIED` and the classification is updated accordingly.
> That is more honest than a row that cites nothing.

## Editions opened

| Edition id | Work                                                        | What was opened                                                                                                                                                                                                                                        | URL                                                                               | Date read  |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ---------- |
| E-BJ-SKT   | Varāhamihira, Bṛhajjātaka (Sanskrit)                        | GRETIL e-text, "Input by Mizue Sugita, December 12, 1994, based on the edition of Oriental Books Reprint Corporation, Second Edition, 1979". 28 chapters. Words are separated by dots in the file; the quotes below join them again.                   | https://gretil.sub.uni-goettingen.de/gretil/1_sanskr/6_sastra/8_jyot/brhajj_u.htm | 2026-10-09 |
| E-BJ-ENG   | The Brihat Jataka of Varaha Mihira, tr. N. Chidambaram Iyer | Internet Archive item `b2488442x`, full text (OCR) of the 1885 translation with the translator's notes. OCR errors are frequent; quotes below are corrected only for obvious letter slips. Used to cross-read the Sanskrit, never as the sole witness. | https://archive.org/stream/b2488442x/b2488442x_djvu.txt                           | 2026-10-09 |

The Bṛhat Jātaka is dated to the 6th century CE. Where it reports the view of an
earlier author (Satya, Parāśara, the Yavanas) the row says so; that is evidence
the view existed by then, not a reading of the earlier work itself.

## Rows

Confidence follows the plan's scale: 90+ = original and a translation both
read and in agreement.

### BJ-1.7 — the thirtieth-parts (Triṃśāṃśa) and their lords

- **Sanskrit (E-BJ-SKT 1.07):** kuja-ravija-guru-jña-śukra-bhāgāḥ pavana-samīraṇa-kaurpi-jūka-leyāḥ / ayuji yuji tu bhe viparyayasthaḥ …
- **Translation (E-BJ-ENG):** "Five, five, eight, seven and five parts (degrees) are respectively those of Mars, Saturn, Jupiter, Mercury, and Venus, in the odd signs. In the even signs their order is reversed."
- **Says:** the lords and the widths: odd signs Mars 5°, Saturn 5°, Jupiter 8°, Mercury 7°, Venus 5°; even signs Venus 5°, Mercury 7°, Jupiter 8°, Saturn 5°, Mars 5°.
- **Does not say:** which SIGN a thirtieth-part falls in. The verse names lords only.
- **Supports:** VCH-D30 (lords and spans), confidence 92. The sign the engine draws for D30 is ANCIENT SOURCE NOT VERIFIED.

### BJ-1.11 — Horā and Dreṣkāṇa

- **Sanskrit (1.11b):** mārtaṇḍa-indvor ayuji sama-bhe candra-bhānvoś ca hore dreṣkāṇāḥ syuḥ sva-bhavana-suta-tri-trikoṇa-adhipānām
- **Says:** in an odd sign the two horās belong to the Sun then the Moon, in an even sign to the Moon then the Sun; the three dreṣkāṇas belong to the lords of the sign itself, the 5th and the 9th from it. 1.12 records a different scheme held by "some" (horā of the sign lord then the 11th lord; dreṣkāṇa of the sign, 12th and 11th lords).
- **Supports:** VCH-D2, VCH-D3. Confidence 75 (Sanskrit read; translation of this verse not yet compared).

### BJ-1.13 — exaltation and debilitation

- **Sanskrit (1.13):** aja-vṛṣabha-mṛga-aṅganā-kulīrā jhaṣa-vaṇijā ca divākarādi-tuṅgāḥ / daśa-śikhi-manuyuk-tithi-indriya-aṃśais tri-navaka-viṃśatibhiś ca te asta-nīcāḥ
- **Says:** from the Sun onward the exaltations are Aries 10°, Taurus 3°, Capricorn 28°, Virgo 15°, Cancer 5°, Pisces 27°, Libra 20°; debilitation is in the seventh sign from each.
- **Does not say:** anything about Rāhu or Ketu.
- **Supports:** DIG-EXA for the seven planets, confidence 85 (Sanskrit read; number words decoded: śikhi 3, manu-yuk 28, tithi 15, indriya 5, tri-navaka 27). The node entries in the shared table are ANCIENT SOURCE NOT VERIFIED.

### BJ-2.5 — which planets are malefic

- **Sanskrit (2.05b):** kṣīṇa-indv-arka-mahīsuta-arkatanayāḥ pāpā budhas tair yutaḥ
- **Says:** the waning Moon, the Sun, Mars and Saturn are malefic; Mercury is malefic when joined with them.
- **Supports:** the benefic/malefic lists (no registry id yet). Confidence 75. The engine's fixed lists (Moon and Mercury always benefic) do not follow this; audit item CN3.

### BJ-2.13 — aspects

- **Sanskrit (2.13):** tri-daśa-trikoṇa-caturasra-saptamāny avalokayanti caraṇa-abhivṛddhitaḥ / ravija-amarejya-rudhirāḥ pare ca ye kramaśo bhavanti kila vīkṣaṇe adhikāḥ
- **Translation:** "All the planets aspect the 3rd and 10th houses with a quarter sight, the 5th and 9th houses with half a sight, the 4th and 8th houses with three-quarters of a sight, and the 7th house with a full sight; but Saturn aspects the 3rd and 10th houses with a full sight; Jupiter aspects the 5th and 9th houses with a full sight, and Mars aspects the 4th and 8th houses with a full sight."
- **Supports:** ASP-FUL (7th for all; Saturn 3 and 10, Jupiter 5 and 9, Mars 4 and 8), confidence 93. Also shows that quarter, half and three-quarter aspects are ancient; the engine uses full aspects only.

### BJ-2.16-17 — natural friends, neutrals and enemies

- **Sanskrit (2.16-2.17):** śatrū manda-sitau samaś ca śaśijo mitrāṇi śeṣā raveḥ, tīkṣṇāṃśur himaraśmijaś ca suhṛdau śeṣāḥ samāḥ śītagoḥ / jīva-indu-uṣṇakarāḥ kujasya suhṛdo jño ariḥ sita-arkī samau, mitre sūrya-sitau budhasya himaguḥ śatruḥ samāś ca apare // sūraḥ [so the e-text; read sūreḥ, "of Jupiter"] saumya-sitāv arī ravisuto madhyo apare tv anyathā, saumya-arkī suhṛdau samau kuja-gurū śukrasya śeṣāv arī / śukrajau [so the e-text; read śukra-jñau, "Venus and Mercury", as the translation has it] suhṛdau samaḥ suraguruḥ saurasya ca anye arayaḥ …
- **Translation:** "Saturn and Venus are the enemies of the Sun, Mercury is his neutral, and the rest are his friends. The Sun and Mercury are the friends of the Moon and the rest are her neutrals. The Sun, the Moon, and Jupiter are the friends of Mars; Mercury is his enemy, and Venus and Saturn are his neutrals. The Sun and Venus are the friends of Mercury; the Moon is his enemy, and the rest are his neutrals. Mercury and Venus are the enemies of Jupiter; Saturn is his neutral; and the rest are his friends. Mercury and Saturn are the friends of Venus; Mars and Jupiter are her neutrals, and the rest are her enemies. Venus and Mercury are the friends of Saturn; Jupiter is his neutral, and the rest are his enemies."
- **Says also (2.15):** Varāhamihira gives this as Satya's doctrine and notes another scheme held by "some".
- **Supports:** DIG-FRD for the seven planets, confidence 95. The engine's table is identical. Friendships of Rāhu and Ketu are not in the text: ANCIENT SOURCE NOT VERIFIED.

### BJ-2.18 — friends for the time being

- **Sanskrit (2.18a):** anyonyasya dhana-vyaya-āya-sahaja-vyāpāra-bandhu-sthitās tat-kāle suhṛdaḥ …
- **Says:** planets in the 2nd, 12th, 11th, 3rd, 10th and 4th from one another are friends for the time; the others are enemies; natural and temporary relations are then combined.
- **Supports:** the temporary-friendship rule (the 2/3/4/10/11/12 rule in `shadbala.ts`). Confidence 75.

### BJ-2.19 to 2.21 — where a planet is strong

- **Sanskrit (2.19):** sva-ucca-suhṛt-sva-trikoṇa-navāṃśaiḥ sthāna-balaṃ sva-gṛha-upagataiś ca / dikṣu budha-aṅgirasau ravi-bhaumau sūrya-sutaḥ sita-śītakarau ca
- **Sanskrit (2.20):** udag-ayane ravi-śītamayūkhau vakra-samāgamagāḥ pariśeṣāḥ / vipula-karā yudhi ca uttara-saṃsthāś ceṣṭita-vīrya-yutā parikalpyāḥ
- **Sanskrit (2.21):** niśi śaśi-kuja-saurāḥ sarvadā jño ahni ca anye, bahula-sita-gatāḥ syuḥ krūra-saumyāḥ krameṇa / dvy-ayana-divasa-horā-māsapaiḥ kāla-vīryaṃ, śa-ru-bu-gu-śu-ca-sādyā vṛddhito vīryavantaḥ
- **Translation (2.19, 2.21):** "Mercury and Jupiter are powerful when in the East or rising sign. The Sun and Mars are powerful when on the south or tenth sign. Saturn is powerful when in the West or setting sign, and the Moon and Venus are powerful when in the North or the 4th sign." … "The Moon, Mars and Saturn possess Kalabala at night; Mercury possesses it both day and night; and the other planets possess it by day. The malefic planets possess it during the waning moon and the benefic planets during the waxing moon. Also each planet has it in his year, month, day and hour. Saturn, Mars, Mercury, Jupiter, Venus, the Moon and the Sun are each naturally stronger than the immediately preceding planet in the order stated."
- **Says:** the KINDS of strength and which planet has each: place (exaltation, friend's sign, own trikoṇa, own navāṃśa, own sign); direction (Mercury and Jupiter rising, Sun and Mars in the 10th, Saturn setting, Moon and Venus in the 4th); motion (Sun and Moon in the northern course; the others when retrograde or with the Moon, when bright, and when to the north in a planetary war); time (night for Moon, Mars, Saturn; always for Mercury; day for the rest; dark half for malefics, bright half for benefics; lord of the year, day, hour and month); natural order Saturn < Mars < Mercury < Jupiter < Venus < Moon < Sun.
- **Does not say:** any numbers. There are no virūpas, no 60-point scales, no required minimums, and no Tribhāga (thirds of the day) in this text.
- **Supports:** the list of strength kinds and the planet sets used by SHB-DIG, SHB-NAT, SHB-PAK, SHB-NAI (order only), confidence 88. Every NUMBER in `shadbala.ts` is ANCIENT SOURCE NOT VERIFIED until a later text is opened. Note for S5: the Sun's and Moon's motional strength is tied to the northern course, not a flat value.

### BJ-9.1-9.7 — Aṣṭakavarga: the auspicious places from each contributor

- **Sanskrit:** the seven verses 9.01 to 9.07, e.g. 9.01 "svād arkaḥ prathama-āya-bandhu-nidhana-dvy-ājñā-tapo-dyūnago vakrāt svād iva tadvad eva ravijāc chukrāt smara-antya-ariṣu / jīvād dharma-suta-āya-śatruṣu daśa-try-āya-arigaḥ śītagor eṣv eva antya-tapaḥ-suteṣu ca budhāl lagnāt sa-bandhv-antyagaḥ". Each verse is transcribed, phrase by phrase, beside its numbers in `test/audit/brihat-jataka.audit.spec.ts`. Four places where the e-text's word division or spelling had to be resolved are marked there: 9.03b `karmāny.alābha` read karma-antya-lābha (10, 12, 11); 9.05a `aṣṭama.dāya` read aṣṭa-mada-āya (8, 7, 11); 9.05b `āya.ratha` read āya-artha (11, 2); 9.06b `vyago` read vyayago (12). Each reading gives the verse the count the chapter total needs.
- **Says:** for each of the seven planets, the houses counted from each of the eight contributors (seven planets and the Lagna) in which it is auspicious. Totals 48, 49, 39, 54, 56, 52, 39 = 337.
- **Does not say:** anything about the reductions (Trikoṇa, Ekādhipatya), the multipliers or the piṇḍas. Chapter 9 has eight verses and ends with the reading rule (9.08).
- **Supports:** AKV-BAV, confidence 88 (Sanskrit read in full and decoded; the translation of this chapter not yet compared line by line). All 56 lists in the engine match. Audit items A1 to A4 are ANCIENT SOURCE NOT VERIFIED here.

### BJ-12.2 and 12.11 — Rajju, Musala, Nala

- **Sanskrit (12.02a):** rajjur muśalaṃ nalaś cara-ādyaiḥ …
- **Translation:** "According to Satyachariyar if all the planets occupy the movable, fixed or common signs, the yogas are respectively known as Rajju, Musala, and Nala and these three form the group of Asraya yogas."
- **Results (12.11, translation):** "A person born under a Rajju yoga will be jealous of the wealth of others, will proceed to foreign lands and will be fond of travelling; a person born under a Musala yoga will be respectable, rich, and will engage in various undertakings; and a person born under a Nala yoga will be of defective organs, settled views, rich and skilled in work."
- **Supports:** YGA-ASR, confidence 93. The engine had Nala for movable signs and Rajju for dual signs (audit item YG4, fixed). The "defective organs" part of the Nala result is left out of the text shown to users under the health-safety rule.

### BJ-12.4 — Gadā, Śakaṭa, Vihaga, Śṛṅgāṭaka, Hala

- **Sanskrit (12.04):** āsanna-kendra-bhavana-dvayagair gadā-ākhyas tanu-astageṣu śakaṭaṃ vihagaḥ kha-bandhvoḥ / śṛṅgāṭakaṃ navama-pañcama-lagna-saṃsthair lagna-anyagair halam iti pravadanti taj-jñāḥ
- **Says:** planets in two neighbouring angles: Gadā; in the 1st and 7th: Śakaṭa; in the 10th and 4th: Vihaga; in the 9th, 5th and 1st: Śṛṅgāṭaka; in such trines away from the Lagna: Hala.
- **Note:** this is the only Śakaṭa in the Bṛhat Jātaka, and it is a figure of all the planets. The Moon-and-Jupiter "Shakata" the engine reports is not in this text: ANCIENT SOURCE NOT VERIFIED for that rule. Confidence 75.

### BJ-13.2 — Adhi Yoga

- **Sanskrit (13.02a):** saumyaiḥ smara-ari-nidhaneṣv adhiyoga indoḥ …
- **Translation:** "If the benefic planets (a) occupy the 6th, 7th and 8th houses from the Moon, the yoga is known as Adhiyoga (b)." Notes: "(a) These are Mercury, Jupiter and Venus. (b) The yoga is of 7 sorts according as the benefic planets occupy one or more of the three houses."
- **Supports:** YGA-ADH, confidence 90. The engine asked for benefics (the Moon counted among them) in at least two of the three houses, which neither requires all three benefics nor allows them in a single house. Fixed.

### BJ-13.3 and 13.4 — Sunaphā, Anaphā, Durudhurā, Kemadruma

- **Sanskrit (13.03):** hitvā arkaṃ sunaphā-anaphā-durudhurāḥ sva-antya-ubhayasthair grahaiḥ śītāṃśoḥ kathito anyathā tu bahubhiḥ kemadrumo, anyais tv asau kendre śītakare atha vā graha-yute kemadrumo na iṣyate, kecit kendra-navāṃśakeṣu ca vadanty uktiḥ prasiddhā na te
- **Translation:** "Excepting the Sun if the other planets occupy the 2nd, the 12th, or both the 2nd and the 12th houses from the Moon, the yoga is respectively known as Sunapha, Anapha or Durudhura; otherwise, the yoga is known as Kemadruma by numerous writers. According to some, if the Moon occupy the Kendra house from the ascendant or if the Moon be accompanied by a planet, the yoga ceases to be a Kemadruma yoga. According to others the three yogas … are referred to the Kendra houses from the Moon, while again some others refer the three yogas to the houses on both sides of the sign the Navamsa of which the Moon occupies. But these views are not considered as authoritative."
- **13.04:** 31 kinds each of Sunaphā and Anaphā and 180 of Durudhurā. 31 + 31 + 180 = 242 = 3⁵ − 1, so the three are separate cases that together cover every arrangement of the five planets.
- **Supports:** YGA-SUN, DOH-KEM (definition and the two cancellations), confidence 93.
- **Against the engine:** Sunapha and Anapha were also reported when both sides were occupied (fixed). For Kemadruma the engine (a) also lets a planet in the 4th, 7th or 10th from the Moon prevent it, which the verse reports as a view "not considered authoritative", and (b) cancels it on Jupiter's aspect, which is not in this verse: ANCIENT SOURCE NOT VERIFIED for (b). Not changed yet; see C-critical-corrections DS3.

### BJ-13.9 — Vasumat (Vasumati)

- **Sanskrit (13.09):** lagnād atīva vasumān vasumāñ chaśāṅkāt saumyagrahair upacaya-upagataiḥ samastaiḥ / dvābhyāṃ samo alpa-vasumāṃś ca tad-ūnatāyām …
- **Translation:** "If all the benefic planets (a) occupy the Upachaya places (b) from the ascendant at the time of birth, a person will be very rich and if they occupy the Upachaya places from the Moon, he will be moderately rich. If two of the planets occupy the Upachaya places a person will be moderately wealthy and if one of them occupy such places he will possess small wealth." Notes: "(a) Mercury, Jupiter and Venus. (b) The 3rd, 6th, 10th and 11th houses."
- **Supports:** YGA-VAS, confidence 92. The engine counted how many of the four houses held a benefic (three needed) and looked from the Moon only. Fixed to: all three benefics in those houses from the Lagna or from the Moon.

---

## Reading list (what to open, not what has been read)

| Text                              | Edition target                                                                   | Where to find it                   |
| --------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------- |
| Bṛhat Jātaka                      | Bangalore: Sagar Publications                                                    | GRETIL; archive.org scan           |
| Bṛhat Saṃhitā                     | Subrahmanya Sastri & Ramakrishna Bhat                                            | archive.org                        |
| Yavanajātaka                      | David Pingree critical edition (1978)                                            | archive.org                        |
| Āryabhaṭīya                       | K.S. Shukla & K.V. Sarma (INSA)                                                  | GRETIL                             |
| Surya Siddhanta                   | Ebenezer Burgess translation (1858)                                              | archive.org                        |
| BPHS (Bṛhat Parāśara Horā Śāstra) | Santhanam two-volume (reference numbering); second edition where chapters differ | archive.org; GRETIL partial        |
| Saravali                          | Kalyana Varma; B.S. Rao translation                                              | archive.org                        |
| Phaladeepika                      | Mantreswara; B.S. Rao translation                                                | archive.org                        |
| Jataka Parijata                   | Vaidyanatha Dikshita; V.S. Shastri                                               | archive.org                        |
| Muhurta Chintamani                | —                                                                                | archive.org                        |
| Jaimini Sutras                    | K.N. Rao translation                                                             | available online                   |
| Uttara Kalamrita                  | Kalidasa                                                                         | archive.org                        |
| Tajika Neelakanthi                | —                                                                                | archive.org                        |
| Hayanaratna                       | Balabhadra; open-access critical edition                                         | GRETIL / academia.edu              |
| Krishnamurti Readers              | KP Readers Vol 1-6                                                               | print; selective quote only        |
| Lal Kitab                         | Original Urdu editions (1939, 1940, 1941, 1942, 1952)                            | archive.org                        |
| Mayamata                          | Dagens translation                                                               | archive.org partial                |
| Manasara                          | Acharya edition                                                                  | archive.org                        |
| JPL Horizons                      | NASA JPL                                                                         | https://ssd.jpl.nasa.gov/horizons/ |
