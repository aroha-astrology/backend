-- ── Adhik Maas date ranges ───────────────────────────────────────────────────
-- Adhik Maas (also Purushottam Maas / Mal Maas / Mol Maas / Londa Maas) is the
-- intercalary lunar month inserted ~every 32 months to keep the lunisolar
-- Hindu calendar aligned with the solar year. During this period most new
-- beginnings (marriage, gruha pravesh, vehicle purchase) are deferred while
-- spiritual observance is intensified.
--
-- Dates verified against Drik Panchang and HinduPad references. Each row is
-- the Gregorian span of one full Adhik Maas occurrence; the month_name is the
-- doubled lunar month (e.g., during Adhik Jyeshtha there are two Jyeshthas in
-- the year — first the Adhika, then the Nija).

create table if not exists panchang_adhik_maas (
  id            serial      primary key,
  start_date    date        not null,
  end_date      date        not null,
  month_name    text        not null,
  description   text        not null,
  unique (start_date, end_date)
);

create index if not exists panchang_adhik_maas_range_idx
  on panchang_adhik_maas (start_date, end_date);

alter table panchang_adhik_maas enable row level security;

drop policy if exists "panchang_adhik_maas_read_all" on panchang_adhik_maas;
create policy "panchang_adhik_maas_read_all"
  on panchang_adhik_maas for select using (true);

insert into panchang_adhik_maas (start_date, end_date, month_name, description) values
  ('2023-07-18', '2023-08-16', 'Shravana',  'Adhik Shravana 2023 (Mol Maas / Purushottam Maas)'),
  ('2026-05-17', '2026-06-15', 'Jyeshtha',  'Adhik Jyeshtha 2026 (Mol Maas / Purushottam Maas)')
on conflict (start_date, end_date) do update set
  month_name  = excluded.month_name,
  description = excluded.description;
