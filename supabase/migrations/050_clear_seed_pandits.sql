-- 050: Clear the seeded pandit catalog before launch.
-- The 100 entries inserted in 032 use placeholder phone numbers
-- ("NOTE: Phone numbers are placeholders — update with real contacts before launch.").
-- This migration wipes the seed table so real pandits can be added via admin /
-- self-onboarding (pandit_profiles). pandit_profiles is intentionally NOT touched.

DELETE FROM pandits;
