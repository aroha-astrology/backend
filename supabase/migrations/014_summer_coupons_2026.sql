-- ============================================================================
-- Migration 014: Replace all coupons with Summer 2026 batch
-- Format: SUMMER-XXXXXXXX-2026 (8 random alphanumeric chars, no O/0/I/1)
-- ============================================================================

-- Remove all existing coupons (unused and used)
TRUNCATE TABLE coupons RESTART IDENTITY CASCADE;

-- ── 20 × 1-token coupons ────────────────────────────────────────────────────
INSERT INTO coupons (code, token_amount) VALUES
  ('SUMMER-UR5HFPYA-2026', 1),
  ('SUMMER-974L8QLD-2026', 1),
  ('SUMMER-VXP6ES7Y-2026', 1),
  ('SUMMER-E2RKYLJT-2026', 1),
  ('SUMMER-4HM5AULU-2026', 1),
  ('SUMMER-U539PX3N-2026', 1),
  ('SUMMER-2UWDKWBH-2026', 1),
  ('SUMMER-MVDGXCPR-2026', 1),
  ('SUMMER-7D2ANWCT-2026', 1),
  ('SUMMER-5YCUPQHM-2026', 1),
  ('SUMMER-36MJ36XE-2026', 1),
  ('SUMMER-S59E2K9E-2026', 1),
  ('SUMMER-KWCV5HGW-2026', 1),
  ('SUMMER-ANH85U4Y-2026', 1),
  ('SUMMER-TF2DXT5U-2026', 1),
  ('SUMMER-UZ7JXAYP-2026', 1),
  ('SUMMER-5BP6AGAU-2026', 1),
  ('SUMMER-GMQQ698Z-2026', 1),
  ('SUMMER-U3PS4EXZ-2026', 1),
  ('SUMMER-9ACJ3LJJ-2026', 1);

-- ── 20 × 2-token coupons ────────────────────────────────────────────────────
INSERT INTO coupons (code, token_amount) VALUES
  ('SUMMER-6TCAJKZD-2026', 2),
  ('SUMMER-GS7GQ9ZC-2026', 2),
  ('SUMMER-GZ4TEJDN-2026', 2),
  ('SUMMER-S9FFUHW8-2026', 2),
  ('SUMMER-YYQYUNFU-2026', 2),
  ('SUMMER-V975UFVS-2026', 2),
  ('SUMMER-YMJ2BNHC-2026', 2),
  ('SUMMER-VRDH38N8-2026', 2),
  ('SUMMER-6CQJYVQP-2026', 2),
  ('SUMMER-RWBTWTU5-2026', 2),
  ('SUMMER-GVBK3H5A-2026', 2),
  ('SUMMER-ZNPRAAW2-2026', 2),
  ('SUMMER-GTA3HJHG-2026', 2),
  ('SUMMER-RJ45KWMV-2026', 2),
  ('SUMMER-EHDAN434-2026', 2),
  ('SUMMER-6ZBUPKVW-2026', 2),
  ('SUMMER-WSS75LM9-2026', 2),
  ('SUMMER-FCEV9UEC-2026', 2),
  ('SUMMER-GAV753AD-2026', 2),
  ('SUMMER-MC5J8ZGU-2026', 2);

-- ── 5 × 10-token coupons ────────────────────────────────────────────────────
INSERT INTO coupons (code, token_amount) VALUES
  ('SUMMER-96AWA6T7-2026', 10),
  ('SUMMER-M68LV85Z-2026', 10),
  ('SUMMER-BSWFZ9KE-2026', 10),
  ('SUMMER-B7BK8V38-2026', 10),
  ('SUMMER-ZY5L6LQW-2026', 10);
