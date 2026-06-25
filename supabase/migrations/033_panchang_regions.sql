-- ── Panchang regional calendar systems ───────────────────────────────────────
-- Reference table: 4 cultural regions of India, each with its primary calendar
-- (Vikram Samvat / Shalivahana Shaka / Bengali San), month-end rule
-- (Purnimanta / Amanta / Solar), 12 month names, era offset, and the popular
-- panchang books read in that region. Seed is identical for every user; the
-- selection itself lives in client state on the Panchang page.

create table if not exists panchang_regions (
  id                text        primary key,
  display_name      text        not null,
  primary_calendar  text        not null,
  month_system      text        not null check (month_system in ('purnimanta','amanta','solar')),
  era_offset        int         not null,
  month_names       jsonb       not null,
  popular_books     jsonb       not null,
  sort_order        int         not null,
  created_at        timestamptz not null default now()
);

alter table panchang_regions enable row level security;

drop policy if exists "panchang_regions_read_all" on panchang_regions;
create policy "panchang_regions_read_all" on panchang_regions for select using (true);

-- Seed the four regions ──────────────────────────────────────────────────────

insert into panchang_regions (id, display_name, primary_calendar, month_system, era_offset, month_names, popular_books, sort_order) values
('north', 'North India', 'Vikram Samvat', 'purnimanta', 57,
  '["Chaitra","Vaishakha","Jyeshtha","Ashadha","Shravana","Bhadrapada","Ashwin","Kartika","Margashirsha","Pausha","Magha","Phalguna"]'::jsonb,
  '[
    {"name":"Thakur Prasad Panchang","language":"Hindi"},
    {"name":"Rishikesh Panchang","language":"Hindi"},
    {"name":"Vishwa Vijay Panchang","language":"Hindi"}
  ]'::jsonb,
  1),

('south', 'South India', 'Shalivahana Shaka', 'amanta', -78,
  '["Chaitra","Vaishakha","Jyeshtha","Ashadha","Shravana","Bhadrapada","Ashwin","Kartika","Margashirsha","Pausha","Magha","Phalguna"]'::jsonb,
  '[
    {"name":"Pambu Panchangam","language":"Tamil"},
    {"name":"Giri Kannan","language":"Tamil"},
    {"name":"Thirunelveli Panchangam","language":"Tamil"},
    {"name":"Mallige","language":"Kannada"}
  ]'::jsonb,
  2),

('west', 'West India', 'Shalivahana Shaka', 'amanta', -78,
  '["Chaitra","Vaishakh","Jyeshtha","Ashadh","Shravan","Bhadrapad","Ashwin","Kartik","Margashirsh","Paush","Magh","Phalgun"]'::jsonb,
  '[
    {"name":"Kalnirnay","language":"Marathi"},
    {"name":"Nirnaya Sagar Neemuch","language":"Marathi"},
    {"name":"Mahalakshmi Calendar","language":"Marathi"}
  ]'::jsonb,
  3),

('east', 'East India', 'Bengali San', 'solar', -593,
  '["Boishakh","Joishtho","Ashadh","Srabon","Bhadro","Ashwin","Kartik","Agrahayan","Poush","Magh","Falgun","Choitro"]'::jsonb,
  '[
    {"name":"Benimadhab Sil Panjika","language":"Bengali"},
    {"name":"Gupta Press Panjika","language":"Bengali"},
    {"name":"Kohinoor Panjika","language":"Odia"}
  ]'::jsonb,
  4)
on conflict (id) do update set
  display_name     = excluded.display_name,
  primary_calendar = excluded.primary_calendar,
  month_system     = excluded.month_system,
  era_offset       = excluded.era_offset,
  month_names      = excluded.month_names,
  popular_books    = excluded.popular_books,
  sort_order       = excluded.sort_order;

-- ── Era new-year transitions ─────────────────────────────────────────────────
-- Verified Gregorian dates on which each region's era year increments.
-- North/South/West use Chaitra Shukla Pratipada (Hindu lunisolar new year);
-- East uses Mesha Sankranti (sidereal Sun crosses 0° Aries, ~April 14).
-- Span 2024-04 → 2028-12 covers any 2-year window picked from the date picker.

create table if not exists panchang_era_year_starts (
  region      text not null references panchang_regions(id) on delete cascade,
  era_year    int  not null,
  start_date  date not null,
  primary key (region, era_year)
);

alter table panchang_era_year_starts enable row level security;
drop policy if exists "panchang_era_year_starts_read_all" on panchang_era_year_starts;
create policy "panchang_era_year_starts_read_all"
  on panchang_era_year_starts for select using (true);

-- Hindu lunisolar new-year (Chaitra Shukla Pratipada) — N/S/W
-- Dates verified against Drik Panchang.
insert into panchang_era_year_starts (region, era_year, start_date) values
  -- North: Vikram Samvat (Gregorian + 57)
  ('north', 2081, '2024-04-09'),
  ('north', 2082, '2025-03-30'),
  ('north', 2083, '2026-03-19'),
  ('north', 2084, '2027-04-07'),
  ('north', 2085, '2028-03-27'),
  -- South: Shalivahana Shaka (Gregorian - 78)
  ('south', 1946, '2024-04-09'),
  ('south', 1947, '2025-03-30'),
  ('south', 1948, '2026-03-19'),
  ('south', 1949, '2027-04-07'),
  ('south', 1950, '2028-03-27'),
  -- West: Shalivahana Shaka (Marathi convention; Gudi Padwa)
  ('west', 1946, '2024-04-09'),
  ('west', 1947, '2025-03-30'),
  ('west', 1948, '2026-03-19'),
  ('west', 1949, '2027-04-07'),
  ('west', 1950, '2028-03-27'),
  -- East: Bengali San (Pohela Boishakh; Mesha Sankranti)
  ('east', 1431, '2024-04-14'),
  ('east', 1432, '2025-04-14'),
  ('east', 1433, '2026-04-14'),
  ('east', 1434, '2027-04-15'),
  ('east', 1435, '2028-04-14')
on conflict (region, era_year) do update set
  start_date = excluded.start_date;
