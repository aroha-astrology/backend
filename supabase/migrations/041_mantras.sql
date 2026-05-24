-- ============================================================================
-- Migration 041: Mantras catalog + audio storage bucket + jaap_reward txn type
--
-- Adds:
--   1. public.mantras catalog table (12 seeded mantras: 9 planet + 3 deity)
--   2. mantra-audio Supabase Storage bucket (public read, service-role write)
--   3. 'jaap_reward' to credit_transactions.type so completed jaap sessions
--      can be logged as positive credit grants without breaking RLS.
-- ============================================================================

-- 1. mantras table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mantras (
  key               text PRIMARY KEY,
  name              text NOT NULL,
  mantra_text       text NOT NULL,
  deity             text NOT NULL,
  description       text NOT NULL,
  mukhi             int  NOT NULL,
  category          text NOT NULL CHECK (category IN ('planet', 'deity')),
  jaap_count        int  NOT NULL DEFAULT 108,
  reward_credits    int  NOT NULL DEFAULT 1,
  audio_url         text,
  audio_duration_ms int,
  sort_order        int  NOT NULL DEFAULT 0,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE public.mantras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mantras readable by authenticated" ON public.mantras;
CREATE POLICY "mantras readable by authenticated"
  ON public.mantras FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS mantras_sort_order_idx ON public.mantras (sort_order);

-- 2. Storage bucket for audio files ------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('mantra-audio', 'mantra-audio', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "mantra-audio public read" ON storage.objects;
CREATE POLICY "mantra-audio public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'mantra-audio');

-- 3. Extend credit_transactions type CHECK to allow 'jaap_reward' ------------
-- Includes every type that has appeared in earlier migrations (008, 035) so
-- existing rows continue to satisfy the constraint after we redefine it.
ALTER TABLE credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN (
    'signup_bonus', 'purchase', 'video_debit', 'report_debit',
    'referral', 'refund', 'coupon_redeem', 'feature_debit',
    'chat_debit', 'jaap_reward'
  ));

-- 4. Seed mantra catalog -----------------------------------------------------
-- mukhi: 1-9 maps to planet (Sun=1 … Ketu=9); 0 for deity beads (smooth bead).
-- audio_url stays NULL until scripts/generate-mantra-audio.ts populates it.
INSERT INTO public.mantras
  (key, name, mantra_text, deity, description, mukhi, category, sort_order)
VALUES
  ('sun',      'Sun Mantra',       'Om Hraam Hreem Hraum Sah Suryaya Namah',      'Lord Surya',        'Boosts confidence, vitality and leadership.',                                              1, 'planet', 1),
  ('moon',     'Moon Mantra',      'Om Shraam Shreem Shraum Sah Chandraya Namah', 'Lord Shiva',        'Calms the mind and balances emotions.',                                                    2, 'planet', 2),
  ('mars',     'Mars Mantra',      'Om Am Angarakaya Namah',                      'Lord Hanuman',      'Increases willpower and energy while helping to resolve land disputes and debts.',         3, 'planet', 3),
  ('mercury',  'Mercury Mantra',   'Om Braam Breem Braum Sah Budhaya Namah',      'Lord Vishnu',       'Sharpens intellect, speech and learning.',                                                 4, 'planet', 4),
  ('jupiter',  'Jupiter Mantra',   'Om Graam Greem Graum Sah Gurave Namah',       'Lord Brihaspati',   'Brings wisdom, prosperity and good fortune.',                                              5, 'planet', 5),
  ('venus',    'Venus Mantra',     'Om Draam Dreem Draum Sah Shukraya Namah',     'Goddess Lakshmi',   'Attracts love, beauty and abundance.',                                                     6, 'planet', 6),
  ('saturn',   'Saturn Mantra',    'Om Sham Shanaishcharaya Namah',               'Lord Shani Dev',    'Reduces hardship and rewards patience.',                                                   7, 'planet', 7),
  ('rahu',     'Rahu Mantra',      'Om Ram Rahave Namah',                         'Goddess Durga',     'Removes confusion and shields from sudden setbacks.',                                      8, 'planet', 8),
  ('ketu',     'Ketu Mantra',      'Om Kem Ketave Namah',                         'Lord Ganesha',      'Aids spiritual insight and detachment.',                                                   9, 'planet', 9),
  ('ganesha',  'Ganesha Mantra',   'Om Gam Ganapataye Namah',                     'Lord Ganesha',      'Removes obstacles and blesses new beginnings.',                                            0, 'deity',  10),
  ('saraswati','Saraswati Mantra', 'Om Aim Saraswatyai Namah',                    'Goddess Saraswati', 'Inspires creativity, learning and clarity.',                                               0, 'deity',  11),
  ('shiva',    'Shiva Mantra',     'Om Namah Shivaya',                            'Lord Shiva',        'The universal mantra for peace and liberation.',                                           0, 'deity',  12)
ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  mantra_text = EXCLUDED.mantra_text,
  deity       = EXCLUDED.deity,
  description = EXCLUDED.description,
  mukhi       = EXCLUDED.mukhi,
  category    = EXCLUDED.category,
  sort_order  = EXCLUDED.sort_order,
  updated_at  = now();
