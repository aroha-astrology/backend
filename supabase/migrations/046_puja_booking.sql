-- ============================================================================
-- 046: Puja Booking Platform + Pandit Role
--
-- Extends the read-only pujas + pandits catalog (032) into a two-sided
-- booking marketplace:
--   * Adds 'pandit' as a user account_type (alongside existing personal/astrologer)
--   * pandit_profiles  — self-onboarded pandits, keyed by users.id
--   * pandits_public   — unified view over seed pandits + self pandits
--   * pujas            — adds suggested_dhanam, image_path defaults; seeds 20 more
--   * puja_offerings   — catalog + puja-specific add-ons (Anna Seva, etc)
--   * puja_bookings    — full lifecycle (pending → accepted → … → completed)
--   * booking_members  — sankalp (1..6 members, each with name + gotra)
--   * booking_offerings— join: which offerings were added per booking
--   * booking_messages — accept/decline notes + status changelog
--
-- All financial amounts are in Dhanam (in-app credits). 10 Dhanam ≈ Rs 100.
-- Member math: first member free, each additional member +10 Dhanam.
-- ============================================================================

-- ── 1. Extend account_type to include 'pandit' ──────────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_type_check;
ALTER TABLE users
  ADD CONSTRAINT users_account_type_check
  CHECK (account_type IN ('personal', 'astrologer', 'pandit'));

-- ── 2. Extend pujas with pricing + ensure image_path defaults ───────────────
ALTER TABLE pujas
  ADD COLUMN IF NOT EXISTS suggested_dhanam int NOT NULL DEFAULT 1000;

-- Backfill suggested_dhanam based on duration_min for the existing 30 rows.
UPDATE pujas SET suggested_dhanam = CASE
  WHEN duration_min IS NULL          THEN 1000
  WHEN duration_min <=  60           THEN  500
  WHEN duration_min <=  90           THEN  750
  WHEN duration_min <= 120           THEN 1000
  WHEN duration_min <= 150           THEN 1500
  WHEN duration_min <= 180           THEN 2000
  WHEN duration_min <= 240           THEN 3000
  WHEN duration_min <= 300           THEN 4000
  ELSE 5000
END
WHERE suggested_dhanam = 1000;  -- only touch rows still at default

-- ── 3. Seed 20 additional pujas (total → 50) ────────────────────────────────
INSERT INTO pujas (slug, name_en, name_sanskrit, short_desc, long_desc, deity, primary_dosha, primary_planet, intent_tags, base_priority, duration_min, suggested_dhanam) VALUES
('hanuman-chalisa-path',     'Hanuman Chalisa Path 108',       'हनुमान चालीसा पाठ',        'Chant the Chalisa 108 times for courage and protection.',                'A continuous 108-recitation of the Hanuman Chalisa builds a shield of devotion against fear, evil eye, and Mars-related obstacles. Performed on Tuesdays for maximum potency.',                                                  'Hanuman',               null,        'mars',     array['protection','health','obstacles','career'],         55,  60,  500),
('sundarkand-path',          'Sundarkand Path',                'सुन्दरकाण्ड पाठ',           'Recite the Sundarkand for hope and a turning of fortune.',               'The Sundarkand from Ramcharitmanas is recited overnight when life feels stuck. The narrative of Hanuman crossing the ocean inspires breakthrough — recommended during prolonged hardship.',                                          'Hanuman / Ram',         null,        'jupiter',  array['obstacles','wealth','protection','marriage'],        60,  90,  750),
('ayyappa-puja',             'Ayyappa Puja & Abhishekam',      'अयप्पा पूजा',              'South Indian Ayyappa puja for discipline and purity.',                   'Ayyappa Puja is observed with strict vrat, especially during Mandala Pooja. The puja channels Saturn–Saturn–Jupiter discipline and is sought by those starting Sabarimala vows or aspiring for vairagya.',                          'Ayyappa',               null,        'saturn',   array['protection','moksha','career'],                      45, 120, 1000),
('subramanya-abhishek',      'Subramanya Abhishek',            'सुब्रह्मण्य अभिषेकम्',     'Milk and panchamrit abhishek for Lord Murugan.',                         'Subramanya Abhishek is a powerful remedy for Sarpa Dosha, skin afflictions, and delayed marriage. The bathing of Murugan with milk, honey, and sandal cools afflicted Mars and Ketu energies.',                                    'Murugan / Subramanya',  'kaalsarp',  'mars',     array['marriage','health','protection'],                    65, 120, 1000),
('annapurna-puja',           'Annapurna Devi Puja',            'अन्नपूर्णा देवी पूजा',     'Worship the goddess of nourishment for never-ending abundance.',         'Annapurna Puja invokes the form of Parvati who feeds the universe. Performed by those facing food/income insecurity, or by households seeking that no member ever lacks. Offering of cooked rice is central.',                       'Annapurna',             null,        'venus',    array['wealth','home','health'],                            45,  90,  750),
('tulsi-vivah',              'Tulsi Vivah Ceremony',           'तुलसी विवाह',              'Symbolic marriage of Tulsi and Shaligram for marital harmony.',           'Tulsi Vivah is performed on Kartik Shukla Dwadashi. Married couples renew their bond; unmarried devotees pray to remove obstacles to marriage. The ceremony invokes Vishnu and Lakshmi together.',                                  'Tulsi / Vishnu',        null,        'venus',    array['marriage','home','wealth'],                          50, 120, 1000),
('bhairav-puja',             'Kaal Bhairav Puja',              'काल भैरव पूजा',            'Worship of the fierce guardian for instant protection.',                 'Kaal Bhairav, the dark form of Shiva, is the kotwal of Kashi. His puja with black sesame and mustard oil grants swift protection from witchcraft, court cases, and enemies. Performed on Tuesdays and Sundays.',                    'Kaal Bhairav',          null,        'saturn',   array['protection','obstacles','career'],                  60,  90,  750),
('karthikeya-puja',          'Karthikeya / Skanda Puja',       'कार्तिकेय पूजा',           'Skanda puja for victory, valour, and spiritual power.',                  'Karthikeya, the celestial general, blesses devotees with discipline, command, and victory over inner demons. Performed by youth before competitive exams and by warriors before battle.',                                          'Karthikeya / Skanda',   null,        'mars',     array['career','education','protection'],                  50,  90,  750),
('saraswati-yagna',          'Saraswati Yagna',                'सरस्वती यज्ञ',              'A full fire ritual for awakening intelligence and speech.',              'Saraswati Yagna is a fire offering with specific samidha (palasha wood) and chanting of Saraswati Beej Mantra 108 times. Strongly recommended for students appearing in major exams and for those entering performing arts.',     'Saraswati',             null,        'mercury',  array['education','career','obstacles'],                    50, 120, 1000),
('lakshmi-kuber-puja',       'Lakshmi-Kuber Puja',             'लक्ष्मी कुबेर पूजा',       'Joint worship of Lakshmi and Kuber for sudden wealth.',                  'Lakshmi-Kuber Puja combines the inflow goddess (Lakshmi) with the storehouse god (Kuber). Performed on Dhanteras and Akshaya Tritiya, it activates Venus and Jupiter together for asset accumulation.',                              'Lakshmi / Kuber',       null,        'venus',    array['wealth','career','home'],                            55, 120, 1000),
('ketu-shanti-kalash',       'Ketu Shanti Kalash Puja',        'केतु शान्ति कलश पूजा',     'Deep ritual to remedy severe Ketu affliction.',                          'A 9-kalash variant of Ketu Shanti, performed when Ketu causes mysterious illness, paranormal disturbance, or persistent confusion. Offerings of moonga, kus grass, and 108 Ketu mantras are central.',                                'Ketu',                  null,        'ketu',     array['health','protection','moksha'],                      60, 150, 1500),
('trayambakeshwar-puja',     'Trayambakeshwar Rudra Puja',     'त्र्यंबकेश्वर रुद्र पूजा', 'Special Rudrabhishek at one of the 12 Jyotirlingas.',                    'Performed in the Trayambakeshwar style with 11 priests chanting 11 Rudri paths. Recommended for Sade Sati peak, severe health crisis, or as a high-energy moksha sadhana.',                                                            'Shiva',                 'sadesati',  'saturn',   array['health','longevity','moksha','protection'],          70, 240, 3000),
('vidya-arambha',            'Vidya Arambha Puja',             'विद्या आरम्भ पूजा',        'Initiation ritual for a child beginning education.',                     'Vidya Arambha is the first formal exposure of a child to letters and learning, performed at age 3-5 on Vijaya Dashami or other auspicious dates. Saraswati, Ganesha, and Brihaspati are invoked together.',                          'Saraswati / Ganesha',   null,        'mercury',  array['education','obstacles'],                              40,  60,  500),
('namkaran-sanskar',         'Namkaran (Naming Ceremony)',     'नामकरण संस्कार',          'Sacred Vedic naming ritual on the 11th day of birth.',                   'Namkaran is the second of the 16 sanskars. The child''s name is chosen using the birth nakshatra''s starting syllable. Officiated with Ganapathi puja, navagraha shanti, and blessings from elders.',                                'Multiple deities',      null,        null,       array['home','protection','education'],                     55, 120, 1000),
('upanayana-sanskar',        'Upanayana / Janeu Sanskar',      'उपनयन संस्कार',            'Sacred thread ceremony marking entry into Vedic study.',                 'Upanayana marks the boy''s formal entry into Brahmacharya ashram. Performed between ages 8-16, the Gayatri Mantra is whispered for the first time and the janeu is donned. A multi-hour ritual with detailed havan.',              'Brihaspati / Savitr',   null,        'jupiter',  array['education','moksha','protection'],                    55, 240, 3000),
('antyeshti-shraadh',        'Antyeshti & Shraadh Karma',      'अन्त्येष्टि श्राद्ध कर्म',  'Last rites and ancestral rituals after a passing.',                      'Antyeshti is the final sanskar. Shraadh karma over the subsequent 13 days, then annual Tithi shraddh, releases the soul to peaceful onward journey and reduces Pitra Dosha forming in descendants.',                                    'Pitru Devtas',          'pitra',     null,       array['moksha','protection','home'],                         65, 180, 2000),
('seemantam-puja',           'Seemantam (Baby Shower Puja)',   'सीमन्तोन्नयन',              'Pregnancy ritual in the 7th month for safe delivery.',                   'Seemantam is the third Vedic sanskar, performed between the 4th and 7th month of pregnancy. Mantras for the unborn child''s mental clarity and the mother''s well-being are recited. Often combined with godh bharai customs.',     'Multiple deities',      null,        'moon',     array['childbirth','health','home'],                        55, 150, 1500),
('go-puja',                  'Go Puja (Cow Worship)',          'गौ पूजा',                  'Worship of the cow for prosperity and Pitra appeasement.',                'Go Puja is performed before or on Gopashtami, with sandal, kumkum, and feeding of green fodder. A central practice for grihastha householders, it strengthens Venus and pleases ancestors.',                                            'Kamadhenu',             'pitra',     'venus',    array['wealth','home','protection'],                         45,  60,  500),
('mool-shanti',              'Mool / Gandanta Nakshatra Shanti','मूल शान्ति पूजा',          'Pacify birth in a difficult nakshatra for the newborn.',                 'When a child is born in Mool, Ashlesha, Jyeshtha, Revati or Gandanta sandhi nakshatras, this puja is performed within 27 days. It removes the affliction''s effects on the parents and child.',                                       'Multiple deities',      null,        null,       array['childbirth','health','protection'],                  65, 120, 1000),
('santaan-gopal-mantra',     'Santaan Gopal Mantra Path',      'सन्तान गोपाल मन्त्र पाठ',  'Specialized chant for couples seeking children.',                        'Santaan Gopal Mantra recited 1,25,000 times by a couple actively trying to conceive. The mantra invokes Lord Krishna as the bestower of progeny and is particularly recommended where childbirth is medically delayed.',           'Krishna',               null,        'jupiter',  array['childbirth','marriage','home'],                       60, 180, 2000)
ON CONFLICT (slug) DO UPDATE SET
  name_en        = excluded.name_en,
  name_sanskrit  = excluded.name_sanskrit,
  short_desc     = excluded.short_desc,
  long_desc      = excluded.long_desc,
  deity          = excluded.deity,
  primary_dosha  = excluded.primary_dosha,
  primary_planet = excluded.primary_planet,
  intent_tags    = excluded.intent_tags,
  base_priority  = excluded.base_priority,
  duration_min   = excluded.duration_min,
  suggested_dhanam = excluded.suggested_dhanam;

-- ── 4. Pandit profiles (self-onboarded pandits) ─────────────────────────────
CREATE TABLE IF NOT EXISTS pandit_profiles (
  user_id              uuid       PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name         text       NOT NULL,
  photo_url            text,
  city                 text       NOT NULL,        -- slug, see pandits.city
  city_label           text       NOT NULL,        -- free-form 'Kolkata'
  temple_name          text,
  address              text,
  pincode              text,
  languages            text[]     NOT NULL DEFAULT '{}',
  specialisations      text[]     NOT NULL DEFAULT '{}', -- puja slugs
  years_experience     int,
  rating               numeric(2,1),
  rituals_completed    int        NOT NULL DEFAULT 0,
  pending_prasad_count int        NOT NULL DEFAULT 0,
  verified             bool       NOT NULL DEFAULT true,  -- auto-verified per product
  active               bool       NOT NULL DEFAULT true,  -- admin can demote
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pandit_profiles_city_active_idx
  ON pandit_profiles(city) WHERE active AND verified;

ALTER TABLE pandit_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pandit_profiles_select_all"   ON pandit_profiles;
DROP POLICY IF EXISTS "pandit_profiles_update_self"  ON pandit_profiles;
DROP POLICY IF EXISTS "pandit_profiles_insert_self"  ON pandit_profiles;

CREATE POLICY "pandit_profiles_select_all"
  ON pandit_profiles FOR SELECT USING (true);

CREATE POLICY "pandit_profiles_insert_self"
  ON pandit_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "pandit_profiles_update_self"
  ON pandit_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 5. Unified pandit directory view ────────────────────────────────────────
-- Both the seeded pandits table (read-only catalog) and the self-onboarded
-- pandit_profiles surface here. The user-facing API filters by city +
-- specialisations against this view.
CREATE OR REPLACE VIEW pandits_public AS
  SELECT
    id,
    name,
    photo_url,
    city,
    languages,
    specialisations,
    rating,
    years_experience,
    verified,
    NULL::uuid AS user_id,
    'seed'::text AS source
  FROM pandits
  WHERE verified = true
  UNION ALL
  SELECT
    user_id AS id,
    display_name AS name,
    photo_url,
    city,
    languages,
    specialisations,
    rating,
    years_experience,
    verified,
    user_id,
    'self'::text AS source
  FROM pandit_profiles
  WHERE active AND verified;

GRANT SELECT ON pandits_public TO anon, authenticated;

-- ── 6. Puja offerings ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS puja_offerings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  title       text NOT NULL,
  description text,
  image_path  text,
  dhanam_cost int  NOT NULL CHECK (dhanam_cost >= 0),
  scope       text NOT NULL CHECK (scope IN ('home_delivery','temple_only','catalog')),
  linked_puja text REFERENCES pujas(slug) ON DELETE CASCADE, -- NULL = catalog, shown on every puja
  active      bool NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS puja_offerings_linked_idx ON puja_offerings(linked_puja) WHERE active;
CREATE INDEX IF NOT EXISTS puja_offerings_catalog_idx ON puja_offerings(scope) WHERE scope = 'catalog' AND active;

ALTER TABLE puja_offerings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "puja_offerings_select_all" ON puja_offerings;
CREATE POLICY "puja_offerings_select_all" ON puja_offerings FOR SELECT USING (true);

-- ── 7. Seed catalog offerings + select puja-specific ones ───────────────────
INSERT INTO puja_offerings (slug, title, description, dhanam_cost, scope, linked_puja) VALUES
-- Catalog (every puja can add these)
('anna-seva',          'Anna Seva',           'Feed 21 brahmins or devotees on the day of your puja.',             50,  'catalog', NULL),
('vastra-seva',        'Vastra Seva',         'Offer fresh cotton vastra to the presiding deity.',                  30,  'catalog', NULL),
('gau-seva',           'Gau Seva',            'Feed and care for a cow at a registered goshala.',                   40,  'catalog', NULL),
('deep-seva',          'Deep Seva',           'Light 108 ghee lamps in your name at the temple.',                   25,  'catalog', NULL),
('prasad-box-premium', 'Premium Aashirwad Box','Larger Aashirwad box with dry fruits, kalawa, sindoor, photo.',     110, 'catalog', NULL),
('ganga-jal',          'Ganga Jal Bottle',    'Sealed Ganga jal from Haridwar/Varanasi shipped with prasad.',       20,  'catalog', NULL),
('rudraksh-mala',      'Rudraksh Mala',       '108-bead 5-mukhi rudraksh mala consecrated during the puja.',        90,  'catalog', NULL),
('kalawa-rakshak',     'Consecrated Kalawa',  'Sacred red thread tied during sankalp, shipped with prasad.',        10,  'catalog', NULL),
('panchamrit-vial',    'Panchamrit Prasad',   'Panchamrit prepared during abhishek, sealed in a glass vial.',       15,  'catalog', NULL),
('chunari-offering',   'Chunari for Devi',    'Red/yellow chunari offered to the deity in your name.',              35,  'catalog', NULL),
-- Puja-specific (Hanuman family)
('sindoor-abhishek-hanuman','Sindoor Abhishek for Hanuman','Special chola of sindoor and chameli oil to Lord Hanuman.',       45, 'temple_only', 'hanuman-puja'),
('bada-mangal-aashirwad',  'Bada Mangal Aashirwad Box',   'Hanuman ritual items: gada, sindoor packet, chola prasad, photo.',110, 'home_delivery','hanuman-puja'),
('sundarkand-akhand',      'Akhand Sundarkand',          'Continuous overnight 5-pravachan Sundarkand path in your name.',     150, 'temple_only', 'sundarkand-path'),
-- Shani family
('shani-til-tel-abhishek', 'Shani Til-Tel Abhishek',     'Til oil abhishek to Lord Shani to reduce negativity and obstacles.', 35, 'temple_only', 'sade-sati-shanti'),
('shani-til-tel-abhishek-mantra','Shani 11k Mantra Jap', '11,000 Shani beej mantra recited along with your puja.',           60,  'temple_only', 'sade-sati-shanti'),
-- Shiva family
('rudra-11-path',          'Rudra Ekadashini Path',      '11 priests recite the Sri Rudram 11 times during your abhishek.',  140, 'temple_only', 'rudra-abhishek'),
('mrityunjaya-125k-jap',   '1,25,000 Mahamrityunjay Jap','Specialised jap by 5 brahmins to complete a purascharan in your name.',180,'temple_only', 'maha-mrityunjaya-jaap'),
-- Devi family
('chandi-path-saptashati', 'Devi Saptashati Path',       '700-shloka Durga Saptashati path during your Chandi Homam.',         90, 'temple_only', 'chandi-homam'),
('chunari-mahakali',       'Mahakali Chunari',           'Sacred red chunari offered at Kalighat in your name.',               40,  'home_delivery','durga-saptashati'),
-- Lakshmi/Kuber
('lakshmi-yantra',         'Energised Sri Yantra',       'Sri Yantra energised during the Lakshmi puja, shipped to your home.',75, 'home_delivery','maha-lakshmi-puja'),
('kuber-yantra',           'Kuber Yantra',               'Kuber yantra energised in Lakshmi-Kuber Puja.',                       70, 'home_delivery','lakshmi-kuber-puja'),
-- Ganesha
('modak-prasad',           'Modak Prasad Box',           '21 traditional steamed modaks delivered to your home.',              50,  'home_delivery','ganapathi-homam'),
-- Pitra
('pitra-tirth-jal',        'Pitra Tirth Jal',            'Sealed water from Pitri Tirath, Gaya, shipped with prasad.',         30,  'home_delivery','pitra-tarpan'),
('shradh-bhojan',           'Brahmin Bhojan for Pitra',  'Feed 11 brahmins on Amavasya in your ancestor''s name.',             80,  'temple_only', 'pitra-tarpan'),
-- Education
('saraswati-pen-pencil',   'Saraswati Pen-Pencil Set',   'Pen and pencil consecrated during Saraswati puja, shipped to home.', 20,  'home_delivery','saraswati-puja'),
('saraswati-pen-pencil-yagna','Saraswati Pen-Pencil (Yagna)','Pen-pencil energised during Saraswati Yagna.',                     25,  'home_delivery','saraswati-yagna'),
-- Marriage / Mangal
('mangal-snan-pratima',    'Mangal Pratima Snan',        'Special abhishek of Mangal Murti during your puja.',                 55, 'temple_only', 'mangal-shanti'),
-- Vastu / Griha
('vastu-pyramid',          'Energised Vastu Pyramid',    'Vastu pyramid consecrated during your Vastu Shanti puja.',           60,  'home_delivery','vastu-shanti'),
('griha-pravesh-kalash',   'Griha Pravesh Kalash',       'Sealed sacred kalash for your new home.',                            45,  'home_delivery','griha-pravesh')
ON CONFLICT (slug) DO UPDATE SET
  title = excluded.title,
  description = excluded.description,
  dhanam_cost = excluded.dhanam_cost,
  scope = excluded.scope,
  linked_puja = excluded.linked_puja;

-- ── 8. Puja bookings ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS puja_bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puja_slug        text NOT NULL REFERENCES pujas(slug),
  pandit_source    text NOT NULL CHECK (pandit_source IN ('seed','self')),
  pandit_id        uuid NOT NULL,    -- pandits.id (when source='seed') OR pandit_profiles.user_id (when source='self')
  scheduled_at     timestamptz,
  status           text NOT NULL DEFAULT 'pending_pandit'
    CHECK (status IN ('pending_pandit','accepted','reassignment_pending','in_progress',
                      'video_uploaded','prasad_dispatched','completed','cancelled','refunded')),
  member_count     int  NOT NULL DEFAULT 1 CHECK (member_count BETWEEN 1 AND 6),
  base_dhanam      int  NOT NULL,         -- snapshot at booking time
  member_dhanam    int  NOT NULL DEFAULT 0, -- (member_count - 1) * 10
  offerings_dhanam int  NOT NULL DEFAULT 0,
  total_dhanam     int  GENERATED ALWAYS AS (base_dhanam + member_dhanam + offerings_dhanam) STORED,
  ship_address     text,
  ship_pincode     text,
  video_url        text,
  prasad_tracking  text,
  declined_by      uuid[] NOT NULL DEFAULT '{}', -- pandits who've already declined
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS puja_bookings_user_idx   ON puja_bookings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS puja_bookings_pandit_idx ON puja_bookings(pandit_id, status);
CREATE INDEX IF NOT EXISTS puja_bookings_status_idx ON puja_bookings(status);

ALTER TABLE puja_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bookings_select_own_or_pandit" ON puja_bookings;
DROP POLICY IF EXISTS "bookings_insert_self"          ON puja_bookings;
DROP POLICY IF EXISTS "bookings_update_pandit"        ON puja_bookings;
DROP POLICY IF EXISTS "bookings_update_user_cancel"   ON puja_bookings;

CREATE POLICY "bookings_select_own_or_pandit" ON puja_bookings
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = pandit_id);

CREATE POLICY "bookings_insert_self" ON puja_bookings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bookings_update_pandit" ON puja_bookings
  FOR UPDATE USING (auth.uid() = pandit_id);

CREATE POLICY "bookings_update_user_cancel" ON puja_bookings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 9. Booking members (sankalp) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES puja_bookings(id) ON DELETE CASCADE,
  name        text NOT NULL,
  gotra       text NOT NULL,
  position    int  NOT NULL CHECK (position BETWEEN 1 AND 6),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, position)
);

CREATE INDEX IF NOT EXISTS booking_members_booking_idx ON booking_members(booking_id);

ALTER TABLE booking_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_select_own_or_pandit" ON booking_members;
DROP POLICY IF EXISTS "members_insert_self"          ON booking_members;

CREATE POLICY "members_select_own_or_pandit" ON booking_members
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM puja_bookings b
    WHERE b.id = booking_members.booking_id
      AND (auth.uid() = b.user_id OR auth.uid() = b.pandit_id)
  ));

CREATE POLICY "members_insert_self" ON booking_members
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM puja_bookings b
    WHERE b.id = booking_members.booking_id AND auth.uid() = b.user_id
  ));

-- ── 10. Booking offerings (join) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking_offerings (
  booking_id  uuid NOT NULL REFERENCES puja_bookings(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES puja_offerings(id),
  dhanam_cost int  NOT NULL,           -- snapshot at booking time
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, offering_id)
);

CREATE INDEX IF NOT EXISTS booking_offerings_booking_idx ON booking_offerings(booking_id);

ALTER TABLE booking_offerings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boff_select_own_or_pandit" ON booking_offerings;
DROP POLICY IF EXISTS "boff_insert_self"          ON booking_offerings;

CREATE POLICY "boff_select_own_or_pandit" ON booking_offerings
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM puja_bookings b
    WHERE b.id = booking_offerings.booking_id
      AND (auth.uid() = b.user_id OR auth.uid() = b.pandit_id)
  ));

CREATE POLICY "boff_insert_self" ON booking_offerings
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM puja_bookings b
    WHERE b.id = booking_offerings.booking_id AND auth.uid() = b.user_id
  ));

-- ── 11. Booking messages (accept/decline notes + status changelog) ──────────
CREATE TABLE IF NOT EXISTS booking_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES puja_bookings(id) ON DELETE CASCADE,
  author_role  text NOT NULL CHECK (author_role IN ('user','pandit','system')),
  body         text NOT NULL,
  status_to    text,        -- the status this message accompanies, if any
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_messages_booking_idx ON booking_messages(booking_id, created_at);

ALTER TABLE booking_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "msg_select_own_or_pandit" ON booking_messages;
DROP POLICY IF EXISTS "msg_insert_party"          ON booking_messages;

CREATE POLICY "msg_select_own_or_pandit" ON booking_messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM puja_bookings b
    WHERE b.id = booking_messages.booking_id
      AND (auth.uid() = b.user_id OR auth.uid() = b.pandit_id)
  ));

CREATE POLICY "msg_insert_party" ON booking_messages
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM puja_bookings b
    WHERE b.id = booking_messages.booking_id
      AND (auth.uid() = b.user_id OR auth.uid() = b.pandit_id)
  ));

-- ── 12. Trigger: updated_at on puja_bookings ────────────────────────────────
CREATE OR REPLACE FUNCTION puja_bookings_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS puja_bookings_touch ON puja_bookings;
CREATE TRIGGER puja_bookings_touch
  BEFORE UPDATE ON puja_bookings
  FOR EACH ROW EXECUTE FUNCTION puja_bookings_touch_updated_at();
