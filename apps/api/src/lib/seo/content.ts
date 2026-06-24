// Per-route SEO content (titles, descriptions, FAQs, HowTo) for every public page.
// Keep entries in sync with sitemap.ts and breadcrumbs.ts.
//
// FAQs are seeded plausibles — review and edit copy before hitting production
// SERP impressions.

import type { ToolPageSeo } from './page';

export const SEO_PANCHANG: ToolPageSeo = {
  path: '/panchang',
  title: "Today's Panchang — Tithi, Nakshatra, Rahu Kaal, Choghadiya",
  description:
    "Live Hindu Panchang for today: tithi, nakshatra, yoga, karana, Rahu Kaal, Gulika Kaal, Yamaganda, Abhijit Muhurta and Choghadiya for any city. Free and accurate.",
  isFree: true,
  featureList: [
    'Daily tithi, nakshatra, yoga, karana',
    'Rahu Kaal, Gulika Kaal, Yamaganda timings',
    'Abhijit Muhurta and Choghadiya',
    'Hora chart with planetary lord',
    'Sunrise, sunset, moonrise, moonset',
  ],
  faqs: [
    {
      q: 'What is Panchang?',
      a: 'Panchang is the traditional Hindu calendar that lists the five (pancha) limbs of a day — tithi (lunar day), vara (weekday), nakshatra (lunar mansion), yoga, and karana — used to determine auspicious timings for any activity.',
    },
    {
      id: 'rahu-kaal-today',
      q: 'What is Rahu Kaal and should I avoid it?',
      a: 'Rahu Kaal is a daily 1.5-hour window considered inauspicious for starting new ventures, signing contracts, or undertaking journeys. It varies by location and weekday and is calculated from local sunrise and sunset.',
    },
    {
      q: 'What is Abhijit Muhurta?',
      a: 'Abhijit Muhurta is a roughly 48-minute auspicious window centered on local solar noon, considered favorable for initiating most activities. It is sometimes skipped on Wednesdays.',
    },
    {
      q: 'What is Choghadiya?',
      a: "Choghadiya divides daylight and nighttime into eight roughly equal periods, each ruled by a planet and classified as good (Amrit, Shubh, Labh), neutral (Char), or inauspicious (Kaal, Rog, Udveg). It's commonly used by travelers and traders.",
    },
    {
      q: 'How accurate is the panchang on Aroha Astrology?',
      a: 'All timings are computed using the Swiss Ephemeris and your selected location coordinates. Sunrise, sunset and planetary positions are arc-second accurate.',
    },
    {
      id: 'brahma-muhurta',
      q: 'What is Brahma Muhurta and what time is it today?',
      a: 'Brahma Muhurta is the 48-minute window ending at sunrise, traditionally the most spiritually charged time of the day for meditation, yoga, and study. Exact local timing depends on your sunrise — the panchang shows it for any selected city.',
    },
    {
      id: 'hora',
      q: 'What is Hora and how do I use it?',
      a: 'Hora divides each day into 24 planetary hours, each ruled by one of the 7 classical planets (Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn). Schedule activities with the planet that supports them — Jupiter Hora for teaching, Venus Hora for art and romance, Mercury Hora for negotiation.',
    },
    {
      id: 'pradosh-kaal',
      q: 'What is Pradosh Kaal?',
      a: 'Pradosh Kaal is the 96-minute window straddling local sunset (45 minutes before to 51 minutes after). It is sacred to Shiva — Shivaratri and weekly Pradosh Vrat fasts are observed during this window.',
    },
    {
      q: 'How do I find tomorrow\'s tithi or panchang?',
      a: 'Use the date picker on the panchang page to navigate to any past or future date. All tithi, nakshatra, yoga, karana, and muhurta timings are computed for the date and city you select.',
    },
  ],
};

export const SEO_HOROSCOPE_DAILY: ToolPageSeo = {
  path: '/horoscope/daily',
  title: 'Daily Horoscope Today — All 12 Zodiac Signs (Vedic Rashi)',
  description:
    "Today's Vedic horoscope for all 12 moon-sign Rashis: Aries, Taurus, Gemini, Cancer, Leo, Virgo, Libra, Scorpio, Sagittarius, Capricorn, Aquarius, Pisces. Love, career, health, money.",
  isFree: true,
  featureList: ['Daily prediction for all 12 Rashis', 'Love, career, health, money', 'Lucky color and number', 'Auspicious time of the day'],
  faqs: [
    {
      q: 'Is this a Vedic (sidereal) or Western (tropical) horoscope?',
      a: "Aroha Astrology's daily horoscope is Vedic (sidereal). Vedic horoscope is read by your Moon sign (Janma Rashi), not Sun sign — it reflects the actual position of the Moon at your birth.",
    },
    {
      q: 'Should I read by my Sun sign or Moon sign?',
      a: 'In Vedic astrology, the Moon sign (Rashi) is considered more accurate for daily predictions because the Moon transits the zodiac roughly every 2.25 days, making its position highly relevant to short-term events.',
    },
    {
      q: 'How is the daily horoscope generated?',
      a: 'Predictions blend live planetary transits (especially Moon and Mercury) against each Rashi with classical Vedic principles, then expressed in plain language by AI.',
    },
    {
      q: 'I don\'t know my Moon sign — how do I find it?',
      a: 'Generate a free kundli with your birth date, time, and place — your Moon sign is shown on the chart summary. If you don\'t have your exact birth time, an approximate Moon sign is still reasonably accurate within a day.',
    },
    {
      q: 'Are these predictions personalized?',
      a: 'The public daily horoscope is generic by Rashi. For predictions personalized to your full birth chart and current Mahadasha/Antardasha, sign in and view your dashboard.',
    },
    {
      q: 'What time of day should I read my horoscope?',
      a: 'Read in the morning, before starting major activities. The day\'s Moon transits begin from sunrise; reading early lets you align your decisions with the day\'s energy rather than reacting to it.',
    },
    {
      q: 'Why does my Vedic horoscope differ from my Western horoscope?',
      a: 'Vedic astrology uses the sidereal zodiac (actual star positions); Western uses the tropical zodiac (anchored to the equinox). The two zodiacs are now offset by about 24°, so most people\'s Vedic Sun sign is one sign behind their Western Sun sign.',
    },
  ],
};

export const SEO_HOROSCOPE_WEEKLY: ToolPageSeo = {
  path: '/horoscope/weekly',
  title: 'Weekly Horoscope — All 12 Vedic Rashis',
  description:
    'This week\'s Vedic horoscope for all 12 Rashis: planetary transits, key dates, love, career, money, and health forecast based on Moon sign.',
  isFree: true,
  featureList: ['7-day forecast for all 12 Rashis', 'Key transit dates', 'Best days for major activities'],
  faqs: [
    { q: 'How often is the weekly horoscope updated?', a: 'Refreshed every Monday morning IST with the new week\'s transits.' },
    { q: 'Which week does it cover?', a: 'Monday through Sunday of the current week.' },
    { q: 'Should I use weekly or monthly horoscope?', a: 'Weekly is best for short-term planning (meetings, travel). Monthly captures broader trends like career shifts and relationships.' },
  ],
};

export const SEO_HOROSCOPE_MONTHLY: ToolPageSeo = {
  path: '/horoscope/monthly',
  title: 'Monthly Horoscope — Vedic Predictions for All 12 Rashis',
  description:
    'This month\'s Vedic horoscope for all 12 Moon-sign Rashis. Major planetary transits, retrogrades, eclipses, and key dates for love, career, money and health.',
  isFree: true,
  featureList: ['30-day forecast for all 12 Rashis', 'Retrograde and eclipse alerts', 'Key dates by life area'],
  faqs: [
    { q: 'When does the monthly horoscope reset?', a: 'Updated on the first of every Gregorian month, with major transit dates highlighted within.' },
    { q: 'Does it cover Mahadasha changes?', a: 'Public monthly horoscope is by Rashi. Mahadasha and Antardasha changes are shown on your personalized dashboard after sign-in.' },
  ],
};

export const SEO_HOROSCOPE_YEARLY: ToolPageSeo = {
  path: '/horoscope/yearly',
  title: 'Yearly Horoscope — 2026 Vedic Annual Predictions',
  description:
    'Annual Vedic horoscope for all 12 Rashis: major transits of Saturn, Jupiter, Rahu and Ketu; career, marriage, finance, and health themes for the year.',
  isFree: true,
  featureList: ['12-month outlook for all 12 Rashis', 'Saturn, Jupiter, Rahu, Ketu transits', 'Sade Sati and Dhaiya status'],
  faqs: [
    { q: 'Is the yearly horoscope based on Sade Sati?', a: 'Yes — Saturn\'s 7.5-year Sade Sati and 2.5-year Dhaiya are factored into the year-long outlook for each Rashi.' },
    { q: 'How is this different from Varshaphal?', a: 'Yearly horoscope is by Moon sign and applies to anyone with that Rashi. Varshaphal (Tajaka) is a personal annual chart cast for your exact solar return — much more specific.' },
    { id: 'sade-sati-now', q: 'Which Rashis are in Sade Sati right now?', a: 'Sade Sati moves through the three Rashis surrounding Saturn\'s current sign. Saturn currently transits Aquarius — so Capricorn, Aquarius and Pisces are in some phase of Sade Sati. The yearly horoscope for those Rashis highlights the active phase (rising, peak, or setting).' },
    { id: 'sade-sati', q: 'What is Sade Sati and is it always bad?', a: 'Sade Sati is the 7.5-year period when Saturn transits the 12th, 1st, and 2nd houses from your Moon sign. It is not inherently bad — for those whose Saturn is well-placed natally, it brings durable achievement and authority. For others, it is a period of restructuring, hard work, and karmic reckoning.' },
    { id: 'dhaiya', q: 'What is Dhaiya and how is it different from Sade Sati?', a: 'Dhaiya (also called Ashtama Shani or Kantak Shani) is a 2.5-year period when Saturn transits a single house from your Moon — specifically the 4th or 8th house. It affects emotional foundations (4th) or sudden changes (8th).' },
    { q: 'Will Jupiter transit help my year?', a: 'Jupiter spends about a year in each sign. Its transit through the 2nd, 5th, 9th, or 11th house from your Moon is generally supportive for wealth, children, dharma, and gains. The yearly forecast highlights Jupiter\'s transit position for each Rashi.' },
  ],
};

export const SEO_KUNDLI_GENERATE: ToolPageSeo = {
  path: '/kundli/generate',
  title: 'Free Kundli Online — Vedic Birth Chart by Date of Birth',
  description:
    'Generate your free Vedic kundli (janma kundli) by date, time and place of birth. Get Lagna, Rasi, Navamsa, Vimshottari Dasha, planetary placements, and AI interpretation.',
  isFree: true,
  featureList: [
    'Lagna (Ascendant), Rasi, Navamsa charts',
    'Vimshottari Mahadasha and Antardasha',
    'All 9 planets with degree, sign, nakshatra, pada',
    'Bhava (house) chart',
    'Mangal Dosha and Kaal Sarp Dosha analysis',
    'Free PDF download',
  ],
  howTo: {
    name: 'How to generate your free Vedic kundli',
    description: 'Get your full birth chart in 30 seconds — free.',
    steps: [
      { name: 'Enter birth details', text: 'Type your date of birth, exact time of birth, and city of birth.' },
      { name: 'Pick your city', text: 'Choose your birth city from the dropdown so we use the correct latitude, longitude, and timezone.' },
      { name: 'Generate', text: 'We compute all charts, dashas, and planetary placements using Swiss Ephemeris precision.' },
      { name: 'Read your kundli', text: 'View your Lagna, Rasi, Navamsa, dasha periods, and AI-generated interpretation.' },
    ],
  },
  faqs: [
    {
      q: 'Is this kundli really free?',
      a: 'Yes. Lagna, Rasi, Navamsa, Vimshottari Dasha, planetary placements, Mangal Dosha and Kaal Sarp analysis are all free. Premium AI reports cost separately.',
    },
    {
      q: 'How accurate is the calculation?',
      a: 'Computed using the Swiss Ephemeris at arc-second precision, the same engine professional Vedic astrologers use.',
    },
    {
      q: 'I don\'t know my exact birth time. Can I still use this?',
      a: 'You can — but Lagna and dashas depend on exact time. With unknown time, we use 12:00 PM local and the chart\'s ascendant becomes approximate. Other planetary placements remain reliable.',
    },
    {
      q: 'What is the difference between Rasi and Navamsa?',
      a: 'Rasi (D-1) is your main natal chart showing planet placements at birth. Navamsa (D-9) is the divisional chart most used for marriage, dharma, and the latter half of life — it adds depth to the Rasi reading.',
    },
    {
      q: 'Will my birth data be private?',
      a: 'Yes. Birth data is encrypted, stored against your account only, and never sold. AI predictions are generated on demand.',
    },
    {
      id: 'atmakaraka',
      q: 'What is Atmakaraka and how do I find it in my kundli?',
      a: 'Atmakaraka is the planet at the highest degree in your chart (ignoring Rahu/Ketu in classical Jaimini). It signifies your soul\'s primary mission this lifetime. It is shown in the chart summary section of your kundli.',
    },
    {
      id: 'manglik',
      q: 'How do I check Mangal Dosha in my kundli?',
      a: 'Mars in the 1st, 2nd, 4th, 7th, 8th, or 12th house from Lagna, Moon, or Venus indicates Manglik. The Manglik analysis section of your kundli shows the dosha status, severity, and any classical cancellations that apply.',
    },
    {
      id: 'kaal-sarp',
      q: 'What is Kaal Sarp Dosha and is it in my chart?',
      a: 'Kaal Sarp Dosha occurs when all 7 planets are placed between Rahu and Ketu. There are 12 named variations (Anant, Kulik, Vasuki, etc.) depending on which houses Rahu and Ketu occupy. The dosha analysis section flags it automatically if present.',
    },
    {
      id: 'lagna',
      q: 'What is Lagna and why is it important?',
      a: 'Lagna (Ascendant) is the sign rising on the eastern horizon at the moment of your birth — it changes every 2 hours, which is why exact birth time matters. Lagna determines the entire house structure of your kundli and represents your physical body, personality, and overall life direction.',
    },
  ],
};

export const SEO_MATCH_NEW: ToolPageSeo = {
  path: '/match/new',
  title: 'Free Kundli Matching — Ashtakoot Guna Milan for Marriage',
  description:
    'Free Kundli Milan online — full Ashtakoot Guna Milan (Varna, Vashya, Tara, Yoni, Graha Maitri, Gana, Bhakoot, Nadi) plus Mangal Dosha and Nadi Dosha analysis.',
  isFree: true,
  featureList: [
    '36-point Ashtakoot Guna score',
    'All 8 koots scored individually',
    'Mangal Dosha (Manglik) check for both partners',
    'Nadi Dosha analysis with exceptions',
    'Bhakoot Dosha analysis',
    'AI-written compatibility summary',
  ],
  howTo: {
    name: 'How to match kundli for marriage',
    steps: [
      { name: 'Enter Bride\'s details', text: 'Date, time, and place of birth for the bride.' },
      { name: 'Enter Groom\'s details', text: 'Date, time, and place of birth for the groom.' },
      { name: 'Generate match', text: 'We compute the full 36-point Ashtakoot score and dosha analysis.' },
      { name: 'Read the result', text: 'See the score, individual koots, doshas, exceptions, and an AI compatibility summary.' },
    ],
  },
  faqs: [
    {
      q: 'What score is considered a good match?',
      a: 'Traditionally, 18 out of 36 is considered the minimum acceptable match, 24+ is good, and 28+ is very good. However, the score is only one factor — Manglik and Nadi Dosha analysis matter equally.',
    },
    {
      q: 'My partner is Manglik. Is that a deal-breaker?',
      a: 'Not necessarily. If both partners are Manglik, or if the dosha is canceled (e.g., Mars in own sign, retrograde Mars in certain houses), it is considered nullified. The match shows whether dosha cancellation applies.',
    },
    {
      q: 'What is Nadi Dosha and can it be canceled?',
      a: 'Nadi Dosha occurs when both partners share the same Nadi (Adi/Madhya/Antya). It is considered serious for progeny and health. Several traditional cancellations apply — same Rashi but different nakshatra, etc. — which we surface in the result.',
    },
    {
      q: 'Is exact birth time of both partners required?',
      a: 'Highly recommended. Nadi and certain koots are nakshatra-based, and nakshatra changes ~every 24 minutes. Without exact times, the score is approximate.',
    },
    {
      q: 'What is Bhakoot Dosha and how is it canceled?',
      a: 'Bhakoot Dosha occurs when the partners\' Moon signs are 6/8 or 2/12 apart. Cancellations include same Rashi lord, friendly Rashi lords, or both being in nakshatras of the same lord. The match result surfaces any applicable cancellation.',
    },
    {
      q: 'What should we do if our Guna Milan score is below 18?',
      a: 'A low score does not mean the marriage cannot work — it means specific areas need conscious effort. Look at which koots scored zero, and consult an astrologer for targeted remedies. Many successful long marriages have low scores; many high-score matches fail without effort.',
    },
    {
      q: 'Can two Manglik people marry each other?',
      a: 'Yes. The traditional view is that Manglik-Manglik marriages cancel the dosha for both partners. This is one of the most commonly recommended pairings when both partners have Mars in the dosha houses.',
    },
  ],
};

export const SEO_BABY_NAMES: ToolPageSeo = {
  path: '/baby-names',
  title: 'Vedic Baby Names by Nakshatra & Rashi — Free Generator',
  description:
    'Find auspicious Vedic baby names based on the child\'s nakshatra and rashi (moon sign) at birth. Includes meaning, syllable, and gender filters.',
  isFree: true,
  featureList: ['Names by nakshatra pada syllable', 'Filter by gender, religion, length', 'Meaning and origin', 'Save favorites'],
  faqs: [
    { q: 'How are Vedic baby names chosen?', a: 'Tradition assigns a starting syllable (akshara) based on the pada (quarter) of the child\'s birth nakshatra. Each of the 27 nakshatras has 4 padas, giving 108 possible starting syllables.' },
    { q: 'Do I need exact birth time?', a: 'Yes — nakshatra pada changes about every 51 minutes, which determines the starting syllable.' },
    { q: 'What if my child\'s nakshatra is unknown?', a: 'You can still browse by gender, syllable, meaning or religion without specifying nakshatra.' },
    { q: 'Can the rashi name be different from the official name?', a: 'Yes — this is common practice. The rashi name (based on nakshatra pada) is used in religious ceremonies and family contexts; the legal name on documents can be anything the parents choose. Many families keep both.' },
    { q: 'What is the naming ceremony called and when is it done?', a: 'Namakarana Sanskar is performed on the 11th or 12th day after birth, traditionally during an auspicious muhurta. The child\'s name is whispered into the right ear by the father or family elder.' },
    { q: 'Which nakshatra produces names starting with which letter?', a: 'For example, Ashwini pada 1 starts with "Chu", Bharani with "Li", Krittika with "A", Rohini with "O", Mrigashira with "Ve". Each pada has a specific syllable — the tool shows yours instantly once you enter the birth details.' },
  ],
};

export const SEO_GEMSTONE: ToolPageSeo = {
  path: '/gemstone',
  title: 'Lucky Gemstone Recommendation by Birth Chart — Free',
  description:
    'Free Vedic gemstone recommendation based on your birth chart. Identifies your benefic planet, recommends primary and substitute stones, and provides wearing rules.',
  isFree: true,
  featureList: ['Recommendation based on Lagna, dasha, and benefic planet', 'Primary stone + affordable substitute', 'Wearing rules — finger, day, mantra'],
  faqs: [
    { q: 'How is the right gemstone determined?', a: 'A Vedic astrologer evaluates the lord of the ascendant, current Mahadasha lord, and 9th-house lord to identify your most benefic planet. The gemstone associated with that planet is recommended.' },
    { q: 'Should I wear a gemstone for my Sun sign?', a: 'No. Gemstones are recommended based on your full Vedic birth chart, not just Sun or Moon sign. Sun-sign-only recommendations from Western astrology are not used in Jyotish.' },
    { q: 'Are substitute (uparatna) gemstones effective?', a: 'Yes — substitutes carry the same planetary energy at lower carat and cost. They are a recognized alternative when the primary stone is unaffordable.' },
    { q: 'Is yellow sapphire (Pukhraj) safe for everyone?', a: 'No. Pukhraj amplifies Jupiter — beneficial for most Lagnas, but harmful for Taurus and Libra ascendants where Jupiter rules malefic houses. Always check your chart before wearing.' },
    { q: 'How long does it take for a gemstone to show results?', a: 'Most gemstones begin showing subtle effects within 30–40 days; significant results appear over 3–6 months. The first 11 days after first wearing are considered the activation period.' },
    { q: 'Which finger and which day should I wear my gemstone?', a: 'Sun (Ruby) — ring finger, Sunday. Moon (Pearl) — little finger, Monday. Mars (Coral) — ring finger, Tuesday. Mercury (Emerald) — little finger, Wednesday. Jupiter (Yellow Sapphire) — index finger, Thursday. Venus (Diamond) — middle/ring finger, Friday. Saturn (Blue Sapphire) — middle finger, Saturday. Rahu (Hessonite) and Ketu (Cat\'s Eye) — middle finger, Saturday.' },
    { q: 'Is blue sapphire (Neelam) really dangerous?', a: 'Blue sapphire has the fastest action of any gemstone — results show within 3–7 days, which is why it is feared. Test-wear it for 3 days before permanently wearing. If you feel anxiety, financial loss, or sleep disturbance, remove it immediately.' },
  ],
};

export const SEO_CALENDAR: ToolPageSeo = {
  path: '/calendar',
  title: 'Hindu Calendar 2026 — Festivals, Tithi, Ekadashi, Amavasya',
  description:
    'Hindu calendar with all major festivals, tithis, ekadashis, purnima, amavasya, and auspicious days for any month and year.',
  isFree: true,
  featureList: ['Monthly tithi calendar', 'Major festivals and vrats', 'Ekadashi, Purnima, Amavasya dates', 'Auspicious days for any city'],
  faqs: [
    { q: 'Is this calendar based on Drik Panchang or Vakya Panchang?', a: 'Drik Panchang — based on actual astronomical positions of Sun and Moon, computed from Swiss Ephemeris.' },
    { q: 'Does the calendar adjust for my city?', a: 'Yes — tithi and festival timings are calculated for the location you select.' },
    { q: 'When is Ekadashi this month?', a: 'Ekadashi falls on the 11th tithi of both the bright (Shukla) and dark (Krishna) lunar fortnights — so twice every lunar month. The calendar marks both, along with parana (fast-breaking) timing.' },
    { q: 'When is Purnima (full moon) and Amavasya (new moon)?', a: 'Purnima falls on the 15th tithi of Shukla Paksha; Amavasya on the 15th tithi of Krishna Paksha. The calendar shows the exact start and end times for both, since the tithi may straddle midnight.' },
    { q: 'How do you decide when a festival is observed?', a: 'For festivals tied to a tithi (Diwali, Krishna Janmashtami, Maha Shivaratri), the date follows the tithi at the prescribed time of day — usually sunset, midnight, or sunrise. Where regional traditions differ (e.g., North vs South Janmashtami), the calendar shows both dates.' },
    { q: 'Are Ekadashi and Pradosh dates the same everywhere?', a: 'They can differ by a day across regions because tithis are tied to local sunrise. Set your city for accurate dates — Indian metros, Gulf, US, UK and Australia all supported.' },
  ],
};

export const SEO_MUHURTA: ToolPageSeo = {
  path: '/muhurta',
  title: 'Muhurta — Find Auspicious Time for Marriage, Travel, Business',
  description:
    'Find auspicious muhurta (electional time) for marriage, griha pravesh, travel, business start, vehicle purchase, and other activities. Vedic muhurta finder.',
  isFree: true,
  featureList: ['Muhurta for 20+ activities', 'Tithi, nakshatra, and yoga matching', 'Avoids Rahu Kaal and inauspicious yogas'],
  faqs: [
    { q: 'What is a muhurta?', a: 'Muhurta is an auspicious time window selected for starting an activity. It blends tithi, vara (weekday), nakshatra, yoga, karana, and the planetary positions to maximize success.' },
    { q: 'Is muhurta the same as panchang?', a: 'Panchang is the daily almanac. Muhurta uses the panchang plus other rules to identify a specific auspicious window for a specific activity.' },
  ],
};

export const SEO_GOCHAR: ToolPageSeo = {
  path: '/gochar',
  title: 'Gochar — Live Planetary Transit Over Your Birth Chart',
  description:
    'See live transit (gochar) of all 9 planets over your natal kundli. Includes Sade Sati, Jupiter transit, Rahu-Ketu transit, and Saturn return analysis.',
  isFree: true,
  featureList: ['Live transit of all 9 planets', 'Sade Sati and Dhaiya tracker', 'Jupiter and Saturn transit alerts', 'Effects per house'],
  faqs: [
    { q: 'What is gochar?', a: 'Gochar is the current position of the planets in the sky and how they aspect your natal birth chart. It is the primary tool for predicting current and near-future events in Vedic astrology.' },
    { q: 'How is gochar different from dasha?', a: 'Dasha is the time-based ruling planet for a long period (years). Gochar is the live snapshot of planetary movement that triggers actual events within the dasha period.' },
  ],
};

export const SEO_VARSHAPHAL: ToolPageSeo = {
  path: '/varshaphal',
  title: 'Varshaphal — Your Annual Vedic Horoscope (Tajaka)',
  description:
    'Generate your Varshaphal — annual chart cast for your solar return. Includes Muntha, Year Lord, Sahams, and month-by-month predictions for the year.',
  isFree: true,
  featureList: ['Solar return chart', 'Muntha and Year Lord', 'Yogini and Patyayini Dasha', 'Sahams (Arabic Lots)'],
  faqs: [
    { q: 'What is Varshaphal?', a: 'Varshaphal is the Tajaka (Persian-influenced Vedic) annual chart cast for the moment the Sun returns to its exact natal position each year. It predicts events for the year ahead.' },
    { q: 'When does my Varshaphal year start?', a: 'On your astrological birthday — when the Sun returns to its exact birth degree, usually a day before or after your Gregorian birthday.' },
  ],
};

export const SEO_VARGAS: ToolPageSeo = {
  path: '/vargas',
  title: 'Divisional Charts (Varga) — D-1 to D-60 Free Calculator',
  description:
    'View all 16 traditional Vedic divisional charts (Vargas) — D-1 Rasi, D-9 Navamsa, D-10 Dasamsa, D-7 Saptamsa, D-12 Dwadasamsa, up to D-60 Shastiamsa.',
  isFree: true,
  featureList: ['All 16 traditional Vargas', 'Vimshopaka Bala scoring', 'Each chart with planet placements', 'Free to view all'],
  faqs: [
    { q: 'Why look at divisional charts?', a: 'Each Varga zooms into a specific area of life — D-9 for marriage, D-10 for career, D-7 for children, D-12 for parents, etc. They add depth that the natal Rasi alone cannot show.' },
    { q: 'Which Varga is most important?', a: 'D-9 Navamsa is considered second only to D-1 Rasi. It governs marriage, dharma, and the second half of life.' },
  ],
};

export const SEO_KP_SYSTEM: ToolPageSeo = {
  path: '/kp-system',
  title: 'KP Astrology — Krishnamurti Paddhati Online Calculator',
  description:
    'Free KP astrology calculator using sub-lord theory and Placidus house system. Includes KP Significators, Ruling Planets, and Horary KP.',
  isFree: true,
  featureList: ['Sub-lord and sub-sub-lord cuspal analysis', 'Placidus house system', 'Significators with ABCD ranking', 'Ruling Planets'],
  faqs: [
    { q: 'How is KP different from traditional Vedic astrology?', a: 'KP uses Placidus houses and sub-lord theory to make highly specific event predictions. Traditional Vedic uses whole-sign houses and broader dasha+gochar timing.' },
    { q: 'Is KP more accurate than Parashari?', a: 'KP is generally faster for pinpointing event timing. Parashari is richer for life-themes and personality. Many astrologers use both.' },
  ],
};

export const SEO_VASTU: ToolPageSeo = {
  path: '/vastu',
  title: 'Vastu Shastra — Free Home, Office & Plot Vastu Analysis',
  description:
    'Vastu Shastra principles for home, office, kitchen, bedroom, and plot. Free Vastu analysis with directional recommendations and remedy suggestions.',
  isFree: true,
  featureList: ['Room-by-room Vastu rules', 'Plot orientation analysis', 'Vastu Purusha Mandala', 'Remedies for Vastu doshas'],
  faqs: [
    { q: 'What is Vastu Shastra?', a: 'Vastu is the ancient Indian science of architecture that aligns living and working spaces with the five elements and cardinal directions to enhance health, prosperity, and harmony.' },
    { q: 'I cannot rebuild my home — can Vastu still help?', a: 'Yes — many remedies (mirrors, plants, color, salt water, yantras) work without structural changes.' },
  ],
};

export const SEO_TAROT: ToolPageSeo = {
  path: '/tarot',
  title: 'Free AI Tarot Reading — Daily Card, Love, Career Spreads',
  description:
    'Free AI tarot reading with daily card, three-card spread, Celtic Cross, and love/career spreads. AI-interpreted with traditional Rider-Waite meanings.',
  isFree: true,
  featureList: ['Daily card, 3-card, Celtic Cross', 'Love and career spreads', 'Rider-Waite meanings + AI interpretation'],
  faqs: [
    { q: 'Is AI tarot accurate?', a: 'Tarot is a reflective tool — its value comes from interpretation against your question. AI helps articulate the meaning of the spread; the insight comes from your honest engagement with the question.' },
    { q: 'How do I ask a good tarot question?', a: 'Frame open-ended questions starting with "what", "how" or "why" rather than yes/no. Instead of "Will I get the job?" ask "What should I focus on for this job opportunity?" Open questions give the cards space to reveal nuance.' },
    { q: 'What is the difference between a 3-card and Celtic Cross spread?', a: 'A 3-card spread (past–present–future, or situation–action–outcome) is best for quick clarity on one question. The 10-card Celtic Cross is deeper — it surfaces hidden influences, conscious vs unconscious drivers, and likely outcomes for complex situations.' },
    { q: 'Can a reversed card always be read as bad?', a: 'No. Reversed cards often signal an internal version of the upright meaning, a delay, or energy that needs integration — not a negative outcome. The Tower reversed, for example, can mean a crisis avoided.' },
    { q: 'How often should I pull a daily card?', a: 'Once a day, in the morning, with a single question in mind. Avoid re-pulling on the same question — the second reading is usually a reflection of doubt, not new information.' },
    { q: 'Are Vedic astrology and tarot compatible?', a: 'Yes. Many Indian readers cross-reference: the Vedic kundli sets the long-term life themes, tarot answers near-term specific questions. They are complementary, not contradictory.' },
  ],
};

export const SEO_PALM: ToolPageSeo = {
  path: '/palm',
  title: 'AI Palmistry — Read Your Palm Lines Free',
  description:
    'Free palmistry reading by photo. Upload a clear photo of your palm and our AI reads your heart, head, life, and fate lines.',
  isFree: true,
  featureList: ['Heart, head, life, fate line analysis', 'Mounts and finger length analysis', 'Photo-based — no manual measurement'],
  faqs: [
    { q: 'Which hand should I photograph?', a: 'For most readings, the dominant hand (the one you write with). Some traditions read both — dominant for current life, non-dominant for inherited tendencies.' },
    { q: 'What kind of photo works?', a: 'Bright natural light, palm fully open, fingers slightly spread, lines clearly visible. Avoid hard shadows.' },
  ],
};

export const SEO_DREAMS: ToolPageSeo = {
  path: '/dreams',
  title: 'Vedic Dream Interpretation — What Does Your Dream Mean?',
  description:
    'Free dream analysis blending Vedic Swapna Shastra, Jungian symbolism, and AI interpretation. Search common dream symbols or describe your dream.',
  isFree: true,
  featureList: ['Vedic Swapna Shastra meanings', 'Common dream symbol library', 'Personalized AI dream interpretation'],
  faqs: [
    { q: 'Which dreams are considered most meaningful in Vedic tradition?', a: 'Dreams in the last quarter of the night (Brahma Muhurta, roughly 3:30–5:30 AM) are traditionally considered most predictive. Dreams during the first quarter are considered least meaningful.' },
    { q: 'What does it mean to see a snake in a dream?', a: 'In Vedic Swapna Shastra, snakes are associated with hidden wisdom, kundalini, and Rahu energy. Killing a snake often signals overcoming an enemy or obstacle; being bitten can indicate sudden financial gain or repressed desire surfacing. Context matters — the colour, action, and your emotion all change the reading.' },
    { q: 'Are recurring dreams more important?', a: 'Yes. Recurring dreams signal unresolved karma or an unconscious pattern asking for attention. Vedic tradition treats them as messages from the soul or ancestral memory.' },
    { q: 'What dreams are considered auspicious?', a: 'Seeing temples, deities, white animals, flowing water, climbing upward, the rising sun or moon, and being blessed by elders are traditionally auspicious. Eating sweet food, weddings, and lotus flowers are also positive signs.' },
    { q: 'What dreams are considered inauspicious?', a: 'Falling from a height, your own death, hair falling out, dirty water, broken mirrors, and being chased are traditionally inauspicious. Vedic tradition prescribes specific remedies (water donation, mantra) to neutralize bad dreams.' },
    { q: 'Should I act on a dream?', a: 'Treat dreams as guidance, not instruction. A dream may reveal what you already sense subconsciously — but major life decisions should still be made with conscious reflection, ideally cross-checked against your kundli.' },
  ],
};

export const SEO_PRASHNA: ToolPageSeo = {
  path: '/prashna',
  title: 'Prashna Kundli — Vedic Horary Astrology Online',
  description:
    "Ask a question and get a Vedic Prashna kundli — a chart cast for the moment of your question. Used when birth time is unknown or for direct yes/no answers.",
  isFree: true,
  featureList: ['Chart cast for question moment', 'Lagna and Moon analysis', 'Direct answer to specific questions'],
  faqs: [
    { q: 'When should I use Prashna over natal kundli?', a: 'When you don\'t know your birth time, or when you have a specific time-bound question (will the deal close? will I get the job?). Prashna excels at specific event timing.' },
    { q: 'How does Prashna astrology actually work?', a: 'Prashna casts a chart for the exact moment you sincerely ask a question. The premise is that the question arises in your mind only when the cosmos is positioned to give a clear answer — so that chart, read with horary rules, contains the answer.' },
    { q: 'What kinds of questions work best for Prashna?', a: 'Specific, time-bound, single-issue questions: "Will I get this job within 3 months?", "Will my lost ring be found?", "Should I sign this contract?" Vague or compound questions ("Will I be happy?") do not yield clear answers.' },
    { q: 'Can I ask the same question twice?', a: 'No. Asking the same question repeatedly is considered to invalidate the reading — you should wait at least 7 days, and only ask again if circumstances genuinely change.' },
    { q: 'What is the difference between Prashna and Tarot?', a: 'Both answer specific questions in the moment. Prashna uses a Vedic horary chart with planet placements, lordships, and dasha; tarot uses card symbolism. Prashna is more structured and gives specific timing; tarot is more reflective and intuitive.' },
    { q: 'Is Prashna reliable without my birth details?', a: 'Yes — that is its key strength. Prashna does not need your birth time, place, or even your name. It uses only the moment of the question.' },
  ],
};

export const SEO_REMEDIES: ToolPageSeo = {
  path: '/remedies',
  title: 'Vedic Astrology Remedies — Mantra, Yantra, Stone, Donation',
  description:
    'Personalized Vedic remedies based on your kundli — mantras, yantras, gemstones, charity, fasting, and rituals to strengthen weak planets and pacify malefics.',
  isFree: true,
  featureList: ['Mantra recommendations', 'Yantra and rudraksha', 'Donation and fasting per day/planet', 'Personalized to your chart'],
  faqs: [
    { q: 'Do astrological remedies actually work?', a: 'Vedic tradition holds that remedies work through three pathways — discipline (sankalpa), karmic shift (donation, charity), and energetic resonance (mantra, yantra). The mechanism is debated; the practice is consistent across millennia.' },
    { q: 'Can I do remedies without an astrologer?', a: 'Generic remedies (Hanuman Chalisa for Mars, Aditya Hridaya for Sun) are safe for anyone. Specific remedies (gemstones, complex pujas) should be matched to your chart — which is what we do here.' },
  ],
};

export const SEO_LIFE_JOURNEY: ToolPageSeo = {
  path: '/life-journey',
  title: 'Life Journey — Vimshottari Dasha Timeline Visualised',
  description:
    'Visualise your full life through Vimshottari Dasha periods. See past Mahadashas with key life events and the upcoming dasha timeline with predictions.',
  isFree: true,
  featureList: ['Full Vimshottari Mahadasha timeline', 'Antardasha and Pratyantardasha drill-down', 'Sade Sati and Dhaiya overlay', 'AI-written phase analysis'],
  faqs: [
    { q: 'What is Vimshottari Dasha?', a: 'A 120-year planetary period system based on your Moon\'s nakshatra at birth. Each planet rules a fixed number of years (Sun 6, Moon 10, Mars 7, Rahu 18, Jupiter 16, Saturn 19, Mercury 17, Ketu 7, Venus 20).' },
    { q: 'How does dasha differ from transit?', a: 'Dasha is the slow-moving "season" of your life ruled by one planet. Transit (gochar) is the live weather. Events happen when transit triggers what dasha promises.' },
  ],
};

export const SEO_LIFE_JOURNEY_PHASE: ToolPageSeo = {
  path: '/life-journey/phase',
  title: 'Current Life Phase — Your Active Mahadasha & Antardasha',
  description:
    'Detailed analysis of your currently active Mahadasha and Antardasha — what to expect, watchouts, opportunities, and recommended remedies.',
  isFree: true,
  featureList: [
    'Current Mahadasha lord and remaining duration',
    'Active Antardasha and Pratyantardasha',
    'Themes, watchouts, and opportunities for the phase',
    'Recommended remedies for the active planet',
  ],
  faqs: [
    { q: 'How long is each life phase?', a: 'Mahadasha lengths range from 6 years (Sun) to 20 years (Venus). Antardasha sub-periods within each Mahadasha typically last months to a couple of years. Pratyantardasha (the next sub-level) lasts weeks to months.' },
    { q: 'Which dasha is best — Jupiter or Venus?', a: 'Both are benefic but produce different lives. Jupiter Mahadasha (16 years) brings wisdom, teachers, children, growth in dharma. Venus Mahadasha (20 years) brings beauty, partnerships, art, luxury. The "best" dasha depends on the planet\'s strength and placement in your own chart, not the planet alone.' },
    { q: 'What does Saturn Mahadasha mean?', a: 'Saturn Mahadasha is 19 years of structure, discipline, hard work, and karmic reckoning. If Saturn is well-placed in your chart, it brings durable achievements and authority. If poorly placed, it brings delays, isolation, or health challenges — which dedicated remedies can soften.' },
    { q: 'Is Rahu Mahadasha always difficult?', a: 'Not always — Rahu Mahadasha (18 years) is intense and unconventional. For some it is breakthrough, foreign success, fame; for others it is confusion and material excess. House placement and planetary aspects determine which.' },
    { q: 'How do I prepare for a difficult dasha?', a: 'Start the recommended planetary remedies (mantra, donation, fasting on the planet\'s day) six months before the dasha begins. Build savings and stability in the year before a Saturn or Rahu Mahadasha. Avoid major new ventures in the first 3 months of any new dasha.' },
    { q: 'Can two dashas of the same planet feel different?', a: 'Yes. Your Antardasha (sub-period) modifies how the Mahadasha plays out. Saturn-Jupiter feels very different from Saturn-Mars even though both are inside the same Saturn Mahadasha.' },
  ],
};

export const SEO_GUNA_CHAKRA: ToolPageSeo = {
  path: '/guna-chakra',
  title: 'Guna Chakra — Your Personality Radar from Vedic Birth Chart',
  description:
    'See six personality dimensions — Leadership, Communication, Analytical, Emotion, Drive, Creative — drawn from your Vedic birth chart strengths. Free personality radar.',
  isFree: true,
  featureList: [
    'Six-axis personality radar from your kundli',
    'Scores derived from Shadbala planetary strengths',
    'Optional AI-written personality summary',
    'Switch between saved profiles',
  ],
  faqs: [
    {
      q: 'How is the Guna Chakra calculated?',
      a: "Each axis is derived from the Shadbala (six-fold strength) of the planets associated with that quality — for example, Leadership combines Sun and Mars strength, Communication leans on Mercury. Scores are normalised 0–100 against each planet's required strength.",
    },
    {
      q: 'Is this the same as the 36-guna kundli matching?',
      a: "No. Kundli matching uses Ashtakoota gunas to score compatibility between two charts. Guna Chakra reads personality dimensions from a single chart — it's a different kind of guna ('quality') reading.",
    },
    {
      q: 'Will my radar change over time?',
      a: 'The radar reflects the strengths fixed at birth, so the chart itself is stable. What shifts over time is which traits are activated — that is governed by your current dasha and transits.',
    },
  ],
};

export const SEO_PAST_LIFE: ToolPageSeo = {
  path: '/past-life',
  title: 'Past Life Reading — Who You Were & What You Carried Forward',
  description:
    'A soul-level past-life reading drawn from your Vedic birth chart. Who you were, what you mastered, what stayed unfinished, and how that thread shows up in your life now.',
  isFree: false,
  faqs: [
    { q: 'How is past life read from a birth chart?', a: 'Vedic astrology traces past-life patterns through Ketu (south node — what the soul has already mastered), Rahu (north node — new karma to fulfil), the 12th house (moksha and prior-life themes), and retrograde planets (karma being re-processed).' },
    { q: 'Will the reading change if I update my life context?', a: 'Yes. When you tell us about your work, relationship, or financial situation, the past-life reading regenerates so the "how it shows up now" passage mirrors your actual present life — not generic abstractions.' },
  ],
};

export const SEO_COUPLE: ToolPageSeo = {
  path: '/couple',
  title: 'Couple Compatibility — Synastry by Vedic Birth Charts',
  description:
    'Vedic synastry between two birth charts — Ashtakoot Guna Milan, Mangal/Nadi Dosha, common dasha periods, and AI relationship dynamics analysis.',
  isFree: true,
  featureList: [
    'Full Ashtakoot 36-point Guna Milan',
    'Synastry across Rasi, Navamsa and other Vargas',
    'Overlapping Mahadasha and Antardasha analysis',
    'Mangal, Nadi and Bhakoot Dosha check with cancellations',
    'AI relationship dynamics summary',
  ],
  faqs: [
    { q: 'How is this different from kundli matching?', a: 'Kundli matching gives the traditional Ashtakoot 36-point Guna Milan score for marriage. Couple compatibility goes deeper — synastry across multiple divisional charts, shared dasha periods, and an AI-written dynamics summary.' },
    { q: 'Can this be used for non-marital relationships?', a: 'Yes. The synastry layer reads emotional resonance, communication, and shared values — useful for live-in partners, long-term friendships, and business partnerships, not just marriage.' },
    { q: 'What if we have a low Guna Milan score but feel right together?', a: 'A low Ashtakoot score points to areas needing conscious effort, not a verdict against the relationship. Modern Vedic counsel weighs synastry, dasha overlap, and personal maturity equally with the traditional 36-point score.' },
    { q: 'Do shared Mahadasha periods help or hurt?', a: 'Shared benefic dashas (Jupiter, Venus, Moon) typically support harmony. Shared malefic dashas (Saturn, Rahu) can create simultaneous stress phases but also deep bonding through shared challenge.' },
    { q: 'What is the most important factor in Vedic compatibility?', a: 'Traditionally Nadi (8 points), Bhakoot (7 points), and Gana (6 points) carry the most weight in the 36-point system. Beyond that, the 7th house lord placement in both charts and Venus condition are critical for marital harmony.' },
    { q: 'Is exact birth time required for both partners?', a: 'Strongly recommended. Nakshatra-based koots (Nadi, Yoni, Tara, Gana) shift every 24 minutes, and Navamsa synastry depends on Lagna which moves every 4 minutes. Without exact times, results are approximate.' },
  ],
};

export const SEO_REPORTS_PREMIUM: ToolPageSeo = {
  path: '/reports/premium',
  title: 'Premium AI Astrology Reports — Career, Marriage, Wealth, Health',
  description:
    'Premium AI-interpreted Vedic reports: Career, Marriage, Wealth, Health, Annual, Sade Sati, and Mahadasha analysis. Personalized to your birth chart.',
  featureList: ['7 specialized reports', 'AI interpretation grounded in Swiss Ephemeris calculations', 'Downloadable PDF', 'Reviewed by panel of Vedic astrologers'],
  faqs: [
    { q: 'How are premium reports different from the free kundli?', a: 'Free kundli gives you the chart and basic placements. Premium reports interpret what those placements mean for a specific life area, contextualised with your active Mahadasha, Antardasha, and current transits.' },
    { q: 'Which report should I start with?', a: 'If you are unsure, start with the Annual report — it covers career, finance, relationships, and health for the year ahead. For a focused decision (job change, marriage, investment), the topical report (Career, Marriage, Wealth) is sharper.' },
    { q: 'Is the AI just generating generic text?', a: 'No. The report is generated against your actual Lagna, planetary placements, Shadbala scores, currently running dasha periods, and live transits. The same template would produce a different report for two different birth charts because the underlying calculations differ.' },
    { q: 'Will the report mention exact dates and events?', a: 'Where the chart supports it — yes. Mahadasha and Antardasha transitions are exact dates, and major transit events (Saturn into a sign, Jupiter retrograde) are dated. Generic life themes are presented as phases, not single dates.' },
    { q: 'Can I download the report as a PDF?', a: 'Yes. Every premium report is available as a clean, printable PDF immediately after generation.' },
    { q: 'How is privacy handled for premium reports?', a: 'Birth data is encrypted at rest and tied to your account only. Reports are generated on demand, never shared, and never used to train external models.' },
    { q: 'Are the reports reviewed by a real astrologer?', a: 'AI generates the text from your real chart calculations; a panel of Vedic astrologers reviews report templates and prompt patterns for tradition-fidelity. Individual reports are not manually rewritten.' },
  ],
};

export const SEO_PANDIT_PUJA: ToolPageSeo = {
  path: '/pandit-puja',
  title: 'Book Online Pandit for Puja — Verified Vedic Priests',
  description:
    'Book a verified pandit for online or in-person puja — Mahamrityunjaya, Lakshmi, Navagraha, Satyanarayan, Ganesh, Hanuman, and remedy-specific pujas.',
  featureList: [
    'Verified Vedic-credentialed pandits',
    'Online (recorded) and in-person bookings',
    '30+ pujas — Navagraha, Mahamrityunjaya, Lakshmi, Satyanarayan, Ganesh, Hanuman, Rudrabhishek',
    'Sankalpa in your name and gotra',
    'Prasad delivery across India',
  ],
  faqs: [
    { q: 'Are the pandits verified?', a: 'Yes — every pandit is verified for Vedic credentials (Shastri / Acharya / Veda Paatashala lineage) and reviewed by users after each booking.' },
    { q: 'Can I book a remote or online puja?', a: 'Yes. The pandit performs the puja with sankalpa in your name and gotra, live-streams or records the ritual, and ships the prasad to your address.' },
    { q: 'Which puja should I book for which problem?', a: 'Navagraha for general planetary afflictions; Mahamrityunjaya for health and life-threat protection; Lakshmi for financial stagnation; Satyanarayan for thanksgiving and new beginnings; Rudrabhishek for Saturn / Sade Sati relief; Ganesh before any major undertaking.' },
    { q: 'How is the muhurta chosen for the puja?', a: 'Based on your birth chart and the puja deity — the pandit picks an auspicious tithi, nakshatra, and time that supports the puja\'s purpose. You can also request a specific date and we will find the best window within it.' },
    { q: 'Do I need to be physically present?', a: 'For online pujas, no — you can join via video at the sankalpa moment, or simply receive the recording. For in-person home pujas, the family is expected to be present.' },
    { q: 'Will the puja work even if I do not understand Sanskrit?', a: 'Yes. The pandit recites the mantras correctly on your behalf — the sankalpa (intention) is what binds the puja to you. You will be given a simple meaning sheet so you understand each stage.' },
    { q: 'How long does a typical puja take?', a: 'Short pujas (Satyanarayan, Ganesh): 1–2 hours. Medium (Navagraha, Lakshmi): 2–4 hours. Major (Rudrabhishek, Maha Mrityunjaya 1.25 lakh jaap): 4–8 hours or multi-day.' },
    { q: 'What is the cost range?', a: 'Pujas start at affordable single-pandit online ceremonies and scale up for multi-pandit havans and multi-day rituals. Each listing shows the inclusive price — pandit dakshina, samagri, and prasad delivery — with no hidden fees.' },
  ],
};

export const SEO_KUNDLI_INDEX: ToolPageSeo = {
  path: '/kundli',
  title: 'My Kundli — View, Download, Share Your Vedic Birth Chart',
  description:
    'View, download, and share your Vedic birth chart (kundli). Lagna, Rasi, Navamsa, dasha periods, and full planetary placements.',
  isFree: true,
  featureList: [
    'View all saved Vedic birth charts',
    'Download kundli as PDF',
    'Share kundli with family or astrologer',
    'Switch between multiple profiles',
  ],
  faqs: [
    { q: 'How do I download my kundli as a PDF?', a: 'Open the kundli, then tap Download. A clean printable PDF with all charts, planet placements, and Vimshottari Dasha is generated instantly.' },
    { q: 'Can I save multiple kundlis on one account?', a: 'Yes — save kundlis for yourself, your spouse, children, parents, and friends. Switch between profiles from the same account.' },
    { q: 'Is my saved kundli private?', a: 'Yes. Each kundli is encrypted and tied to your account only. Sharing a kundli generates a one-time link that you control — you can revoke it any time.' },
    { q: 'Can I edit a saved kundli?', a: 'Yes — edit birth date, time, or place anytime. All charts, dashas, and predictions regenerate automatically with the updated data.' },
  ],
};
