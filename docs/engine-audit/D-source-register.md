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

| Edition id | Work                                                                                   | What was opened                                                                                                                                                                                                                                                                                                                                  | URL                                                                                           | Date read  |
| ---------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ---------- |
| E-BJ-SKT   | Varāhamihira, Bṛhajjātaka (Sanskrit)                                                   | GRETIL e-text, "Input by Mizue Sugita, December 12, 1994, based on the edition of Oriental Books Reprint Corporation, Second Edition, 1979". 28 chapters. Words are separated by dots in the file; the quotes below join them again.                                                                                                             | https://gretil.sub.uni-goettingen.de/gretil/1_sanskr/6_sastra/8_jyot/brhajj_u.htm             | 2026-10-09 |
| E-BS-SKT   | Varāhamihira, Bṛhatsaṃhitā (Sanskrit)                                                  | GRETIL e-text "Version 4.3, May 8, 1998, digitalized by Michio Yano and Mizue Sugita, based on the edition of A.V. Tripathi (Sarasvati Bhavan Granthamala)". From chapter 53 on the chapters are numbered one lower than in Kern's edition (here 52 is the Vāstuvidyā, 68 the five great men).                                                   | https://gretil.sub.uni-goettingen.de/gretil/1_sanskr/6_sastra/8_jyot/brhats_u.htm             | 2026-10-09 |
| E-BS-ENG   | The Brihat Sanhita of Varaha Mihira, tr. N. Chidambaram Iyer (1884)                    | Internet Archive item `bihatsahitvarah00iyergoog` (Google scan), OCR full text. Readable; verse numbers in the Vāstu chapter run two above the Sanskrit's. The other scan of the same translation (`brihatsamhitaenglishtranslationchidambaramiyerpart121884_478_p`) has unusable OCR.                                                           | https://archive.org/stream/bihatsahitvarah00iyergoog/bihatsahitvarah00iyergoog_djvu.txt       | 2026-10-09 |
| E-BPHS-ENG | Bṛhat Parāśara Horā Śāstra, tr. R. Santhanam (Ranjan Publications, 1984), vols 1 and 2 | Internet Archive item `BPHSEnglish`, OCR full text of both volumes (chapters 1-50 and 51-97 by his numbering). Read for chapters 3 (relationships, dignities), 26 (aspect values), 27 (Shadbala) and 66-70 (Ashtakavarga, not yet read). The translator's NOTES add things the verses do not say; where they matter the row says which is which. | https://archive.org/stream/BPHSEnglish/BPHS%20-%201%20RSanthanam_djvu.txt (and `%20-%202%20`) | 2026-10-09 |
| E-BPHS-SKT | Bṛhat Parāśara Horā Śāstra, Sanskrit                                                   | Devanagari and IAST text of the chapter at enjoylearningsanskrit.com/scriptures/parashara/chapter-N. Only the Sanskrit lines were used: the site's English translation and word glosses are machine-made and wrong in places (its rendering of 27.13 names the wrong numbers). Numbers in the verses are in the old reversed-digit style.        | https://enjoylearningsanskrit.com/scriptures/parashara/chapter-27                             | 2026-10-09 |
| E-BJ-ENG   | The Brihat Jataka of Varaha Mihira, tr. N. Chidambaram Iyer                            | Internet Archive item `b2488442x`, full text (OCR) of the 1885 translation with the translator's notes. OCR errors are frequent; quotes below are corrected only for obvious letter slips. Used to cross-read the Sanskrit, never as the sole witness.                                                                                           | https://archive.org/stream/b2488442x/b2488442x_djvu.txt                                       | 2026-10-09 |

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

### BJ-1.6 — Navāṃśa and Dvādaśāṃśa

- **Sanskrit (1.06b):** aja-mṛga-tauli-candrabhavana-ādi nava-aṃśa-vidhir bhavana-sama-aṃśaka-adhipatayaḥ sva-gṛhāt kramaśaḥ
- **Translation:** "… and the several signs (of the Zodiac beginning from Aries) commence respectively with the Navamsas of Mesha, Makara, Tula and Kataka." Translator's note: "the Trikona signs of Mesha, Simha, Dhanus begin with the Navamsa of Mesha. Vrishabha, Kanya, Makara begin with the Navamsa of Makara. Mithuna, Tula, Kumbha begin with the Navamsa of Tula; and Karki, Vrischika, Meena begin with the Navamsa of Kataka."
- **Says:** the ninths of Aries, Taurus, Gemini, Cancer (and of their trines) begin with Aries, Capricorn, Libra, Cancer; the twelfths are counted from the sign itself, in order.
- **Supports:** VCH-D9, VCH-D12, confidence 92. The engine's rules are identical.

### BJ-1.11 — Horā and Dreṣkāṇa

- **Sanskrit (1.11b):** mārtaṇḍa-indvor ayuji sama-bhe candra-bhānvoś ca hore dreṣkāṇāḥ syuḥ sva-bhavana-suta-tri-trikoṇa-adhipānām
- **Translation:** "The two horas of the odd signs are respectively the Solar and Lunar horas, and the two of the even signs are respectively the Lunar and Solar horas. The lords of the Drekkanas (of a particular sign) are respectively the lords of that sign, the 5th sign and the 9th sign."
- **Says also (1.12):** a different scheme held by "some": horā of the sign's lord then of the 11th lord; dreṣkāṇa of the sign, its 12th and its 11th.
- **Supports:** VCH-D2, VCH-D3, confidence 92. The engine's rules are identical to 1.11; the 1.12 variant is not offered.

### BJ-1.13 — exaltation and debilitation

- **Sanskrit (1.13):** aja-vṛṣabha-mṛga-aṅganā-kulīrā jhaṣa-vaṇijā ca divākarādi-tuṅgāḥ / daśa-śikhi-manuyuk-tithi-indriya-aṃśais tri-navaka-viṃśatibhiś ca te asta-nīcāḥ
- **Says:** from the Sun onward the exaltations are Aries 10°, Taurus 3°, Capricorn 28°, Virgo 15°, Cancer 5°, Pisces 27°, Libra 20°; debilitation is in the seventh sign from each.
- **Does not say:** anything about Rāhu or Ketu.
- **Supports:** DIG-EXA for the seven planets, confidence 85 (Sanskrit read; number words decoded: śikhi 3, manu-yuk 28, tithi 15, indriya 5, tri-navaka 27). The node entries in the shared table are ANCIENT SOURCE NOT VERIFIED.

### BJ-2.5 — which planets are malefic

- **Sanskrit (2.05b):** kṣīṇa-indv-arka-mahīsuta-arkatanayāḥ pāpā budhas tair yutaḥ
- **Translation:** "The waning Moon, the Sun, Mars, Saturn and Mercury when in conjunction with any of these are malefic planets."
- **Says:** the waning Moon, the Sun, Mars and Saturn are malefic; Mercury is malefic when joined with them. The rest (Jupiter, Venus, the waxing Moon, Mercury alone) are benefic by implication. 2.21 names the dark half (bahula) as the waning Moon's time and the bright half (sita) as its opposite, so "waning" is the dark half, more than 180 degrees ahead of the Sun.
- **Does not say:** anything about Rāhu and Ketu, or whether "joined" means the same sign or a close degree. The engine reads it as the same sign. The translator's note beside it (Jupiter, Venus and Mercury joined with "either of these" are benefic) is a gloss, not the verse; where Mercury is joined with both kinds, the verse's own words (joined with the malefics) are followed.
- **Supports:** DIG-NAT, confidence 90. Implemented in `rules/nature.ts`. Node natures: ANCIENT SOURCE NOT VERIFIED.

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

### BJ-2.5b — the direction each planet presides over

- **Sanskrit (2.05b):** prāg-ādyā ravi-śukra-lohita-tamaḥ-saura-indu-vit-sūrayaḥ …
- **Translation (E-BJ-ENG):** "The Sun presides over east; Venus, south-east; Mars south; Rahu south-west; Saturn west; the Moon north-west; Mercury north; Jupiter north-east."
- **Says:** the eight directions from the east in order belong to the Sun, Venus, Mars, Rāhu, Saturn, the Moon, Mercury, Jupiter. 2.6 adds the five elements: Mars fire, Mercury earth, Jupiter ether, Venus water, Saturn air.
- **Supports:** the planet-to-direction table `PLANETARY_DIRECTIONS` in `vastu.rules.ts`, confidence 93. Ketu to north-east is not in the text: ANCIENT SOURCE NOT VERIFIED. The "element" column of that table mixes the planet's element with the direction's and gives Venus fire where 2.6 says water: left as is, to be decided with the Vastu wording.

### BS-68.1-2 — the five great men (Pañca-mahāpuruṣa)

- **Sanskrit (E-BS-SKT 68.01-02):** tārā-grahaiḥ bala-yutaiḥ sva-kṣetra-sva-uccagaiś catuṣṭayagaiḥ pañca puruṣāḥ praśastā jāyante tān ahaṃ vakṣye / jīvena bhavati haṃsaḥ saureṇa śaśaḥ kujena rucakaś ca / bhadro budhena balinā mālavyo daitya-pūjyena
- **Translation (E-BS-ENG, ch. XXII/69):** "Five Mahapurushas or eminent men will be born when the five planets from Mars to Saturn are powerful and occupy their houses, exaltation signs or the Kendra houses. If the powerful planet be Jupiter, the person born is known as Hamsa; if Saturn, Sasa; if Mars, Ruchaka; if Mercury, Bhadra; and if Venus, Malavya."
- **Says:** the five star-planets (not the Sun or Moon), strong, in their own sign or exaltation sign, in the angles: Mars Ruchaka, Mercury Bhadra, Jupiter Haṃsa, Venus Mālavya, Saturn Śaśa. The rest of the chapter describes the BODY and bearing of each man; it gives no life results such as wealth, status or marriage.
- **Variant:** the translator reads the conditions as alternatives ("their houses, exaltation signs **or** the Kendra houses"). The Sanskrit has the adjectives side by side with no "or", which reads as all together, and the later works name own or exalted sign **and** angle. The engine follows the joint reading; the translator's is recorded, not offered.
- **Not tested by the engine:** "bala-yukta" (strong). The engine reports a strength score beside the yoga but does not require it.
- **Supports:** YGA-PMP, confidence 88 (Sanskrit and translation both read; they differ on "or"). The "Grants wisdom, courage…" sentences the engine shows for each are NOT from this text.

### BS-52.116-117, 52.122, 52.51 — where rooms and water go, and sleeping

- **Sanskrit (E-BS-SKT 52.116):** aiśānyāṃ devagṛhaṃ mahānasaṃ yadi ca api kāryam āgneyyām / nairṛtyāṃ bhāṇḍa-upaskaro arthadhānyāni mārutyām
- **Translation (E-BS-ENG, v. 118):** "The apartment for the Devas shall be built in the north-east; the kitchen in the south-east; the room for the household utensils shall be erected in the south-west; and the treasury and the granary rooms shall be erected in the north-west."
- **Sanskrit (52.117):** prācyādisthe salile sutahāniḥ śikhi-bhayaṃ ripubhayaṃ ca strīkalahaḥ strīdauṣṭyaṃ naiḥsvyaṃ vittātmaja-vivṛddhiḥ
- **Translation (v. 119):** "If there be any piece of water in the east, south-east, south, south-west, west, north-west, north and north-east, there will respectively be the death of sons, injury from fire, troubles from enemies, quarrels among women, unchastity among women, poverty, increase of wealth and increase of sons."
- **Translation (v. 124, Sanskrit 52.122):** "… nor shall he sleep under a beam, nor with his head towards the north or west, nor naked nor with wet feet."
- **Sanskrit (52.51):** pūrvottara-dig-mūrdhā puruṣo ayam avāṅ-mukhaḥ … — the Vāstu-puruṣa lies face down with his head to the north-east (the 81-square plan with 45 deities is 52.42-52.50).
- **Says about the engine's rules:** supports puja room NE, kitchen SE, store SW (vessels) and NW (treasury, grain), water N and NE good and SE, S, SW bad. It contradicts water E and NW rated "acceptable" (the text: death of sons, poverty). It also gives a bad result for water in the W, which the engine leaves unrated.
- **Does not say:** anything about master or other bedrooms, bathrooms, living room, entrance side, dining, parking, stairs, balcony; nor any point score or weights. Those rules, the 0-100 score, the room weights and the AI commentary are ANCIENT SOURCE NOT VERIFIED (a later Vāstu work, Mayamata or Mānasāra, may carry some of them; not opened).
- **Supports:** VST-ANC for those five rules, confidence 90.

### BS-103.4 — transit (gochara) results by house from the birth Moon

- **Sanskrit (E-BS-SKT 103.04):** sūryaḥ ṣaṭ-tri-daśa-sthitas tri-daśa-ṣaṭ-sapta-ādyagaś candramā / jīvaḥ sapta-nava-dvi-pañcama-gato vakra-arkajau ṣaṭ-trigau / saumyaḥ ṣaḍ-dvi-catur-daśa-aṣṭama-gataḥ sūrye api upānte śubhāḥ (variant reading: sarve api) / śukraḥ saptama-ṣaḍ-daśa-ṛkṣa-sahitaḥ śārdūlavat trāsa-kṛt
- **Translation (E-BS-ENG, ch. LVII/104, v. 4):** "When the Sun passes through the 6th, 3rd and 10th signs from the sign occupied by the Moon at the time of birth of a person the effects will be benefic; when the Moon passes through the 3rd, 6th, 10th, 7th, and 1st signs from the Moon, the effects will also be benefic; when Jupiter passes through the 7th, 9th, 2nd and 5th signs or when Mars and Saturn pass through the 6th and 3rd signs or when Mercury passes through the 6th, 2nd, 4th, 10th and 8th signs from the Moon the effects will be benefic. But when Venus passes through the 7th, 6th and 10th signs from the Moon the effects will be malefic. All the planets produce benefic effects when they pass through the 11th house from the Moon."
- **Then (103.05-103.45, translation vv. 5-45):** one result for each planet in each of the twelve houses, which agree with the summary (e.g. Sun in the 3rd "will return to his place, will become rich, happy and free from diseases and will destroy his enemies"; Venus in the 7th "an evil for the sake of a woman"). The count follows the summary, and the per-house verses were read to confirm each.
- **Notes:** (1) Mars in the 10th: the per-house verse (103.17) says "wealth of many kinds", more favourable than the summary; the summary is followed. (2) The twelve-house results are phrased as outcomes (loss of wealth, disease, a quarrelsome wife); the engine uses only the good/bad split.
- **Says:** the transit houses that are good for the seven planets, counted from the birth Moon. The standard "gochara" table.
- **Does not say:** anything about Rāhu or Ketu; and chapter 103 contains NO vedha (obstruction) rule at all. The engine's `VEDHA_PAIRS` table and its Sun-Saturn and Moon-Mercury exemptions have no passage in the Bṛhat Jātaka or Bṛhat Saṃhitā: ANCIENT SOURCE NOT VERIFIED (a later work, e.g. the Phaladeepika, may carry it; not opened).
- **Supports:** GOC-AUS, confidence 93. Rahu and Ketu rows and GOC-VED: not verified.

### BS-97, 98, 99 — which stars, tithis and karanas suit which work

- **Sanskrit (E-BS-SKT 97.06-97.11):** trīṇy uttarāṇi tebhyo rohiṇyaś ca dhruvāṇi … abhiṣeka-śānti-taru-nagara-dharma-bīja-dhruva-ārambhān / mūla-śiva-śakra-bhujaga-adhipāni tīkṣṇāni … abhighāta-mantra-vetāla-bandha-vadha-bheda-saṃbandhāḥ / ugrāṇi pūrva-bharaṇī-pitryāṇi … bandha-viṣa-dahana-śastra-ghāta-ādiṣu / laghu hasta-aśvina-puṣyāḥ paṇya-rati-jñāna-bhūṣaṇa-kalāsu śilpa-auṣadha-yāna-ādiṣu / mṛdu-vargo anūrādhā-citrā-pauṣṇa-aindavāni mitra-arthe suratavidhi-vastra-bhūṣaṇa-maṅgala-gīteṣu ca / hautabhujaṃ saviśākhaṃ mṛdu-tīkṣṇam / śravaṇatrayam āditya-anile ca carakarmaṇi
- **Says:** seven classes of star. Fixed (the three Uttarās and Rohiṇī): coronation, peace rites, planting, founding a city, sowing, lasting undertakings. Sharp (Mūla, Ārdrā, Jyeṣṭhā, Āśleṣā): violent and binding acts. Fierce (the three Pūrvās, Bharaṇī, Maghā): destruction, deceit, poison, fire, weapons. Light (Hasta, Aśvinī, Puṣya): trade, pleasure, learning, ornaments, arts, crafts, medicine, vehicles. Soft (Anurādhā, Citrā, Revatī, Mṛgaśiras): friendship, love, clothing, ornaments, auspicious songs. Mixed (Kṛttikā, Viśākhā). Movable (Śravaṇa, Dhaniṣṭhā, Śatabhiṣaj, Punarvasu, Svāti): travelling and moving work. 98.2 groups the tithis in five sets of three: Nandā, Bhadrā, Vijayā, Riktā (4, 9, 14), Pūrṇā.
- **Sanskrit (99.07-99.08) on marriage:** rohiṇy-uttara-revatī-mṛgaśiro-mūla-anurādhā-maghā-hasta-svātiṣu … pāṇigrahaḥ … tyaktvā ca vyatipāta-vaidhṛti-dinaṃ viṣṭiṃ ca riktāṃ tithiṃ krūra-ayana-pauṣa-caitra-virahe …
- **Says about marriage:** eleven stars (Rohiṇī, the three Uttarās, Revatī, Mṛgaśiras, Mūla, Anurādhā, Maghā, Hasta, Svāti), a Gemini, Virgo or Libra Lagna, a set of house conditions on the benefics, the Moon and the malefics, and the day left out when it is a Vyatipāta or Vaidhṛti yoga day, a Viṣṭi (Bhadrā) karaṇa, or a Riktā tithi, and outside Pauṣa and Caitra.
- **Against the engine:** every star group the engine uses for beginnings falls within these classes, with no conflict, except Mūla: the engine listed it as one to AVOID for marriage; the verse names it as one of the eleven. Fixed (moved to the favourable list). The engine's per-category lists (house, vehicle, business, travel, agreement, puja, product launch) go beyond the text, which gives per-activity lists only for marriage, tonsure (97.12), the thread ceremony (97.15) and travel: ANCIENT SOURCE NOT VERIFIED for those lists, the weekday lists, Ashtami and Navami for marriage, and the 17-tithi "general" list. The engine does not model karaṇa (Viṣṭi) or yoga (Vyatipāta, Vaidhṛti) at all: OPEN.
- **Not read:** the Muhurta Chintamani, which the engine's file header names as its source; not opened.
- **Supports:** MUH-FLT for the marriage star list and the Rikta tithis, confidence 85 (Sanskrit read; this chapter's translation not compared line by line).

### BPHS-3.51-55 — moolatrikona ranges and natural relationships

- **Translation (E-BPHS-ENG, 3.51-54):** Sun: Leo 0-20 moolatrikona, rest own. Moon: after the first 3 degrees of Taurus (exaltation), the rest is moolatrikona. Mars: Aries 0-12. Mercury: Virgo 0-15 exaltation, 15-20 moolatrikona, 20-30 own. Jupiter: Sagittarius 0-10. Venus: Libra 0-15. Saturn: Aquarius 0-20. **3.55:** friends are the lords of the 4th, 2nd, 12th, 5th, 9th and 8th from the moolatrikona sign, with the lord of the exaltation sign; the others are enemies; both at once is neutral.
- **Supports:** the engine's moolatrikona table is identical; the natural friendship table it implies is the same as Bṛhat Jātaka 2.16-17's (BJ-2.16-17). Confidence 90 (translation read; Sanskrit of chapter 3 not compared).

### BPHS-27 — Shadbala (the six-fold strength)

Read in the translation (E-BPHS-ENG) and, for the numbers, in the Sanskrit (E-BPHS-SKT). The engine now follows these rows; `test/audit/shadbala.audit.spec.ts` works each by hand.

- **27.1 Uchcha Bala.** "Deduct from the longitude of the planet its (deep) debilitation point. If the sum is less than 6 signs, consider it as it is; if it exceeds 6 signs, deduct the same from 12 signs … divided by 3." Worked example: the Sun at Pisces 12 deg 15 min, debilitation at Libra 10 deg: 152 deg 15 min / 3 = 50.75 virupas. Engine already did this.
- **27.2-4 Saptavargaja Bala.** Sanskrit (27.03): bhūtābdhayaḥ khāgninakhāḥ tithayo daśa yugāḥ karāḥ, read in the reversed-digit style as 45, 30, 20, 15, 10, 4, 2 for the sign of the planet's own trikoṇa (moolatrikona), own house, great friend, friend, neutral, enemy, great enemy. 27.04: the same for hora, drekkana, saptamsa, navamsa, dvadasamsa and trimsamsa. The translator adds: the compound (five-fold) relationship "be seen in the Rasi chart only". **Against the engine:** it used 45, 30, 22.5, 15, 7.5, 3.75, 1.875 (no old text for these) and looked at the sign chart only. Fixed: the BPHS points are the default; the older set stays as a named profile value. The text does not say whether the moolatrikona DEGREE range applies in the six divisions (only a sign or a lord is known there); the default reads "svatrikoṇa" as the moolatrikona sign, the other reading is a profile value.
- **27.5 Ojhayugmarasyamsa Bala.** Sanskrit: śukrendū samabhāṃśe 'nye viṣame 'ṅghrimitaṃ balam: Venus and the Moon a quarter rupa (15) in an even sign, the others in an odd sign; the translator says the same for the navamsa. Mercury is among "the others", so it scores in odd signs only. **Against the engine:** Mercury scored in both. Fixed.
- **27.5 Kendradi Bala.** Full, half, a quarter of a rupa for angle, succedent, cadent: 60, 30, 15. Engine already did this.
- **27.6 Drekkana Bala.** Sanskrit: ādyamadhyāvasāneṣu dreṣkāṇeṣu sthitāḥ kramāt puṃnapuṃsakayoṣākhyā dadyur aṅghrimitaṃ balam: planets named male, neuter, female give a quarter rupa in the first, middle, last drekkana. The engine does this. **The translator's note reverses neuter and female** (female in the second, eunuch in the third); the verse is followed. Variant recorded, not offered.
- **27.7-8 Dig Bala.** Subtract the 4th house cusp (nadir) from the Sun and Mars, the 7th (descendant) from Jupiter and Mercury, the 10th (meridian) from Venus and the Moon, the ascendant from Saturn; fold to 180; / 3. Example: Saturn exactly on the 7th cusp has 60, exactly on the ascending degree 0. So it is a continuous measure in degrees. **Against the engine:** it used whole houses. Fixed, using the real midheaven.
- **27.8-9 Nathonnatha Bala.** Unnata is the arc from apparent midnight; Nata = 30 ghatis less Unnata; twice the Nata is the strength of the Moon, Mars and Saturn; 60 less that, of the Sun, Jupiter and Venus; Mercury always 60. **Against the engine:** all or nothing by day or night. Fixed (continuous, from the hour angle).
- **27.10-11 Paksha Bala.** "Deduct from the Moon's longitude that of the Sun. If the sum exceeds 6 signs, deduct it from 12. Converted into degrees and divided by 3": the strength of the Moon, Mercury, Venus and Jupiter; 60 less that for the others (the Sun, Mars, Saturn). **Against the engine:** its dark-half branch was inverted (for a Moon 45 degrees past full, the benefics got 15 and the malefics 45; the text gives 45 and 15), so every chart born in the dark half was wrong. Fixed. The translator's notes add that Mercury is a malefic with a malefic and that the Moon's Paksha Bala is "always doubled"; neither is in the verse. Doubling is a profile value (default off).
- **27.12 Tribhaga Bala.** One rupa (60) to Mercury, the Sun, Saturn in the first, second, third part of the day and to the Moon, Venus, Mars in the thirds of the night; Jupiter always. Engine (60) was right; the product document's 30 was wrong.
- **27.13 Varsha, Masa, Dina, Hora Bala.** Sanskrit (27.13): … tithyas triṃśac charārṇavāḥ horeśasya balaṃ ṣaṣṭiḥ: 15, 30, 45 to the lords of the year, month and day, 60 to the lord of the hour. The translation: the lords from the Ahargana (see the next row); "the birth should be treated from sunrise to sunrise"; "each day from sunrise to sunrise is divided into 24 equal parts of one hour". **Against the engine:** year lord from the year number mod 7 and month lord from the Moon's sign lord. Fixed. This also decides the open question about the hora: Shadbala's hora is the EQUAL hour; the Panchang screen's twelfths of day and night are the almanac's convention, which this text does not give.
- **27.14 Naisargika Bala.** 60/7 times 1 to 7 for Saturn, Mars, Mercury, Jupiter, Venus, the Moon, the Sun (Sun 60, Moon 51.43, Venus 42.86, Jupiter 34.29, Mercury 25.71, Mars 17.14, Saturn 8.57). Engine already did this.
- **27.15-17 Ayana Bala.** Khandas 45, 33 and 12 (a stepwise sine); from the tropical longitude's distance from the nearer equinox, (90 plus or minus the stepped value) / 3. Sun, Mars, Jupiter, Venus strong in the northern half; Moon and Saturn in the southern half; Mercury always the added form. The translator adds that the Sun's is doubled; not in the verse (profile value, default off). **Against the engine:** missing. Added.
- **27.18 Cheshta Bala of the Sun and Moon.** The Sun's is his Ayana Bala, the Moon's is her Paksha Bala. **27.24-25, the others:** the Cheshta Kendra is the planet's own sighrocca less the average of its mean and true longitudes, folded to 180, / 3. **Against the engine:** the Sun and Moon flat 30, the others a speed ratio. Fixed. The mean longitudes are astronomy (JPL mean elements), checked in test/audit/mean-longitudes.audit.spec.ts. 27.21-23 also gives eight kinds of motion (retrograde 60, ...); not implemented.
- **27.19 Drik Bala.** "Reduce one fourth of the Drishti Pinda if a planet has malefic aspects on it and add a fourth if it is aspected by a benefic. Superadd the entire aspect of Mercury and Jupiter." The aspect values are chapter 26: from 30 to 300 degrees ahead, in the stages (arc - 30)/2, arc - 60 + 15, (120 - arc)/2 + 30, 150 - arc, (arc - 150) x 2, (300 - arc)/2, with 15 more for Mars in 90-120 and 210-240, 30 more for Jupiter in 120-150 and 240-270, 45 more for Saturn in 60-90 and 270-300. **Against the engine:** whole-house aspects, 3/4 strength for Mars's and Saturn's special aspects, a base of 30 and a clamp to 0-60. Fixed, unclamped. "Superadd the entire aspect of Mercury and Jupiter" is read more than one way and is not applied.
- **27.20 Yuddha Bala** (planetary war): the difference in strength goes to the winner and comes off the loser. Not implemented (the war test is in Bṛhat Saṃhitā 17, not yet read). 27.26-31 Bhava Bala: not implemented.
- **27.32-36 Required totals.** 390, 360, 300, 420, 390, 330, 300 virupas for the Sun to Saturn (6.5, 6, 5, 7, 6.5, 5.5, 5 rupas). Engine already had these. The component minima (Sthana 165, Dig 35, ... for the Sun, Mercury, Jupiter) are not used.
- **Check against the book's own chart.** Santhanam's "standard nativity" (21 May 1944, 19:02 war time, 13 deg 40 min N, 79 deg 20 min E) is given with full longitudes, and the text says its Jupiter has a Shadbala of 9.32 rupas and its Mars 7.32. The engine's positions for that chart match the book's table to the minute. The rewrite gives Jupiter 8.50 and Mars 6.51 rupas: lower by about 0.8 rupa for both. The book does not show its working, so the cause is not known. Possible causes, none confirmed: houses by bhava cusps rather than signs for Kendradi Bala (that would put Jupiter, 4.9 degrees before the midheaven, in an angle: +45 virupas), or another reading of the Drik Bala "superadd" clause. Treat the totals as BPHS-faithful in each term, not as matching one published program.

### BPHS-67 to 69 — Trikona and Ekadhipatya Shodhana, and the Pindas

Read in the translation (E-BPHS-ENG) and the Sanskrit (E-BPHS-SKT, chapters 67 and 68).

- **67.4-5.** Sanskrit: trikoṇeṣu ca yan nyūnaṃ tat tulyaṃ triṣu śodhayet / ekasmin bhavane śūnyaṃ tat trikoṇaṃ na śodhayet / samatve sarvageheṣu sarvaṃ saṃśodhayed budhaḥ. In each trine the smallest count is taken off all three; a trine with a zero in it is not reduced; three equal counts all go to zero. **Against the engine:** a trine with a zero was set to zero in all three signs. Fixed.
- **68.2-6.** Sanskrit: kṣetradvaye phalāni syus tadā saṃśodhayed yathā / kṣīṇena saha ca anyasmin śodhayed grahavarjite // ubhayor grahasaṃyoge na saṃśodhyaḥ kadācana / … ūnena samam anyasmin śodhayed grahavarjite / phalādhike grahair yukte cānyasmin sarvam utsṛjet // ubhayatra grahābhāve samatve sakalaṃ tyajet / sagrahāgrahayos tulye sarvaṃ saṃśodhyam agrahe // kulīrasiṃhayo rāśyoḥ pṛthak kṣetraṃ pṛthak phalam. Only when both signs of a lord have a number; both occupied: nothing; one occupied: the empty sign loses the occupied sign's count, or all of its own if the occupied count is at least as large; neither occupied: equal both zero, unequal the smaller comes off both; Cancer and Leo separate. The chapter's worked cases (Aries 1 against Scorpio 3 gives 1 and 2; Capricorn and Aquarius both 2 gives 2 and 0; Sagittarius 1 against Pisces 2, neither occupied, gives 0 and 1; Gemini and Virgo both 4, neither occupied, gives 0 and 0) are the tests. **Two places the translation is inconsistent and the Sanskrit and the other examples decide:** its rule (1) says both signs "should be given the smaller number" while its own example gives 0 and 1; and its Taurus/Libra example calls Taurus "without planet" yet leaves it at 2 with Libra at 0, which is the occupied-sign case. **Against the engine:** with one sign occupied and the empty sign larger it left both alone (the text takes the occupied count off the empty sign); with neither occupied it zeroed the smaller and left the larger as it was, and for equal counts zeroed only the second sign (the text subtracts the smaller from both and zeroes both when equal). Fixed. The engine counts Rahu and Ketu as planets for occupancy, as the book's own example does.
- **69.1-4.** Multipliers for the signs Aries to Pisces: 7, 10, 8, 4, 10, 5, 7, 8, 9, 5, 11, 12; for the Sun to Saturn: 5, 5, 8, 5, 10, 7, 5. The translation's prose says "6" for Virgo and Capricorn where its table and its worked example (Capricorn 3 x 5 = 15) say 5; 5 is followed. The engine's tables were already these. Rasi Pinda: each sign's reduced count times the sign's multiplier. Graha Pinda: for each planet in the chart (Rahu and Ketu are not taken), the reduced count of the sign it stands in times the planet's multiplier. Yoga Pinda: the two added. Worked example: Rasi Pinda 100, Graha Pinda 48, Yoga Pinda 148. **Against the engine:** its Graha Pinda was the total of all twelve reduced counts times the multiplier of the planet whose table it was. Fixed.
- **70.** The Pinda is used for timing: the sign's count times the Yoga Pinda, divided by 27, the remainder a nakshatra; harm to that house when Saturn transits it. Not implemented. The chapter gives no sign-strength bands: the engine's 25/30 for Sarvashtakavarga and 4 for a planet's own sign are modern rules of thumb, meant for raw counts (ANCIENT SOURCE NOT VERIFIED).
- **Supports:** AKV-TRI, AKV-EKA, AKV-RGK, AKV-GGK, AKV-RP, AKV-GP, AKV-SP. Confidence 90 (Sanskrit of chapters 67 and 68 read; chapter 69's numbers read in the translation, whose table and example agree).

### BPHS-26.6-12 — aspect values

- See the Drik Bala row. Worked from the translator's rule list; the Sanskrit of chapter 26 was not compared. Confidence 80.

### BPHS-46.12-16 — Vimshottari: the order, the years, the balance at birth

Read in the translation (E-BPHS-ENG, vol 2, chapter 46). The OCR of the Sanskrit lines of this chapter is unreadable, so the Sanskrit was not compared. Confidence 80.

- **46.12-14.** "Beginning from Krittika the lords of Dasas (periods) are the Sun, the Moon, Mars, Rahu, Jupiter, Saturn, Mercury, Ketu and Venus in that order." The lord at birth is found by counting the stars from Krittika to the birth star and dividing by nine. The book gives the reason: in Kali Yuga the natural span of a life is taken as 120 years.
- **46.15.** Years: Sun 6, Moon 10, Mars 7, Rahu 18, Jupiter 16, Saturn 19, Mercury 17, Ketu 7, Venus 20. Its table gives each lord three stars: Krittika, Uttara Phalguni, Uttara Ashadha (Sun); Rohini, Hasta, Shravana (Moon); Mrigashira, Chitra, Dhanishta (Mars); Ardra, Swati, Shatabhisha (Rahu); Punarvasu, Vishakha, Purva Bhadrapada (Jupiter); Pushya, Anuradha, Uttara Bhadrapada (Saturn); Ashlesha, Jyeshtha, Revati (Mercury); Magha, Moola, Ashwini (Ketu); Purva Phalguni, Purva Ashadha, Bharani (Venus).
- **46.16.** The part of the dasha already gone is the lord's years times the part of the star the Moon has crossed, divided by the whole star; what is left is the balance at birth.
- **Worked example in the book.** Birth in Mrigashira (Mars, 7 years). Gone: 58 ghatis 15 palas; whole star 59 ghatis 31 palas = 3571 palas. The book prints the gone part as "3415 palas" and 7 x 3415 as "24435". Both are slips of the print (or of this OCR): 58 x 60 + 15 = 3495, 7 x 3415 = 23,905 and 7 x 3495 = 24,465. The book's final figure, a balance of 1 month 23 days 37 ghatis 55 palas, is what 3495 gives (7 x 76 / 3571 = 0.14898 year), so the rule and the final answer are used and the printed 3415 and 24435 are not copied.
- **Against the engine:** the order, the years, the 27-star table, the lord-at-birth rule and the balance rule are identical. No change. Pinned in `test/audit/vimshottari.audit.spec.ts` (the book's table row by row, the Mrigashira balance of 7 x 76 / 3571 years).
- **Supports:** VMD-CYC, VMD-DUR, VMD-BAL.

### BPHS-51.1 — the sub-periods (antardasha and pratyantardasha)

Read in the translation (E-BPHS-ENG, vol 2, chapter 51; the chapter 46 text says the sub-periods come later). Confidence 80.

- **Rule.** The sub-period of one planet inside the dasha of another is the dasha years of the first times the dasha years of the second, divided by 120 (the total). The next level down is cut in the same proportion from the sub-period. The planets follow in the dasha order starting from the lord of the period.
- **Examples in the book.** Venus in Venus: 20 x 20 / 120 = 3 years 4 months. Mercury in Saturn: 17 x 19 = 323; 323 / 120 = 32.3 months = 32 months 9 days (2 years 8 months 9 days).
- **Against the engine:** the same proportion at every level (`buildSubPeriods`). No change. Pinned in the same test file. Sookshma and Prana (levels four and five) are not in this chapter and stay unlabelled.
- **Supports:** VMD-ANT, VMD-PRA.

### BPHS-46.195-199 — the Yogini dasha

Read in the translation (E-BPHS-ENG, vol 2, chapter 46). Confidence 80.

- **Rule.** Eight Yoginis, Mangala, Pingala, Dhanya, Bhramari, Bhadrika, Ulka, Siddha and Sankata, born from the Moon, Sun, Jupiter, Mars, Mercury, Saturn, Venus and Rahu in that order, with 1 to 8 years. "Add 3 to the Janma nakshatra and divide it by 8. The remainder 1 etc. will indicate the Yogini Dasa of Mangala etc." The balance at birth is worked from the part of the star gone, as before.
- **Example in the book.** Mrigashira is star 5; 5 + 3 = 8; remainder 0 means the 8th Yogini, Sankata (Rahu).
- **Against the engine:** `(zero-based star + 3) mod 8` is the same rule (Mrigashira gives Sankata, Ardra gives Mangala). No change. The text says nothing about the sub-periods of this system; the engine uses the same proportion as Vimshottari, which is Aroha's own extension.
- **Supports:** YGN-FULL for the order, the years and the start rule.

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

### BJ-12.10 — yogas by the number of signs occupied (with 12.5 and 12.7)

- **Sanskrit (12.10):** saṃkhyā-yogāḥ syuḥ sapta sapta-ṛkṣa-saṃsthair eka-apāyād vallakī dāminī ca / pāśaḥ kedāraḥ śūla-yogo yugaṃ ca golaś ca anyān pūrvam uktān vihāya
- **Translation:** "If all the planets occupy any seven signs the yoga is known as Vallaki; if they occupy any six signs, the yoga is known as Damini; if they occupy any five signs it is known as Pasa; if any four signs, it is known as Kedara; if any three signs it is known as Sula; if any two signs, it is known as Yuga; and if they occupy a single sign, the yoga is known as Gola. When any of these Sankhya yogas are at the same time any other Nabhasa yogas, they are to be treated as belonging to the latter class." Translator's note: "the Vajra, Yava, Kamala and Vapi yogas described in stanza 5 as well as the Yupa, Ishu, Sakti and Danda yogas described in stanza 7 shall not be confounded with the Kedara yogas described in this stanza."
- **12.5 (translation):** "if all the planets occupy the four Kendras the yoga is known as Kamala, and if they occupy the four Panaphara or the four Apoklima houses, the yoga is known as Vapi." **12.7:** all the planets in the four signs from the ascendant: Yupa; likewise from the 4th, 7th and 10th: Ishu, Sakti, Danda.
- **Supports:** YGA-KED, confidence 92. The engine reported Kedara for any four houses, including those earlier figures. Fixed. Only Kedara of the seven is in the engine; the other six and the figures of 12.4 to 12.9 are not implemented.

### BJ-13.2 — Adhi Yoga

- **Sanskrit (13.02a):** saumyaiḥ smara-ari-nidhaneṣv adhiyoga indoḥ …
- **Translation:** "If the benefic planets (a) occupy the 6th, 7th and 8th houses from the Moon, the yoga is known as Adhiyoga (b)." Notes: "(a) These are Mercury, Jupiter and Venus. (b) The yoga is of 7 sorts according as the benefic planets occupy one or more of the three houses."
- **Supports:** YGA-ADH, confidence 90. The engine asked for benefics (the Moon counted among them) in at least two of the three houses, which neither requires all three benefics nor allows them in a single house. Fixed.

### BJ-13.3 and 13.4 — Sunaphā, Anaphā, Durudhurā, Kemadruma

- **Sanskrit (13.03):** hitvā arkaṃ sunaphā-anaphā-durudhurāḥ sva-antya-ubhayasthair grahaiḥ śītāṃśoḥ kathito anyathā tu bahubhiḥ kemadrumo, anyais tv asau kendre śītakare atha vā graha-yute kemadrumo na iṣyate, kecit kendra-navāṃśakeṣu ca vadanty uktiḥ prasiddhā na te
- **Translation:** "Excepting the Sun if the other planets occupy the 2nd, the 12th, or both the 2nd and the 12th houses from the Moon, the yoga is respectively known as Sunapha, Anapha or Durudhura; otherwise, the yoga is known as Kemadruma by numerous writers. According to some, if the Moon occupy the Kendra house from the ascendant or if the Moon be accompanied by a planet, the yoga ceases to be a Kemadruma yoga. According to others the three yogas … are referred to the Kendra houses from the Moon, while again some others refer the three yogas to the houses on both sides of the sign the Navamsa of which the Moon occupies. But these views are not considered as authoritative."
- **13.04:** 31 kinds each of Sunaphā and Anaphā and 180 of Durudhurā. 31 + 31 + 180 = 242 = 3⁵ − 1, so the three are separate cases that together cover every arrangement of the five planets.
- **Supports:** YGA-SUN, DOH-KEM (definition and the two cancellations), confidence 93.
- **Against the engine:** Sunapha and Anapha were also reported when both sides were occupied (fixed). For Kemadruma the engine (a) also lets a planet in the 4th, 7th or 10th from the Moon prevent it, which the verse reports as a view "not considered authoritative", and (b) cancels it on Jupiter's aspect, which is not in this verse: ANCIENT SOURCE NOT VERIFIED for (b). **Fixed under DS3:** the engine now follows the verse (formed with nothing but the Sun in the 2nd or 12th from the Moon; stopped by the Moon in an angle from the Lagna or with any planet, the Sun included; Rahu and Ketu are not counted, the verse speaks of seven planets). The older exemptions are the profile value `kemadrumaExemptions: 'later-tradition'`.

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
