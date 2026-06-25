#!/usr/bin/env bash
#
# End-to-end smoke test for the onboarding API against a locally running
# server (npm run dev). Mints a dev Firebase token, creates the session, then
# walks the full progressive-profile + birth-profiles + device-token flow.
#
#   bash scripts/test-onboarding.sh
#
# Requires: server on localhost:3000, jq, and a valid dev Firebase setup
# (FIREBASE_WEB_API_KEY + dev service account) so `npm run dev:token` works.
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
UID_ARG="${UID_ARG:-dev-onboarding-1}"

echo "→ Minting dev ID token for uid=$UID_ARG"
TOKEN="$(npm run -s dev:token -- --uid "$UID_ARG")"
AUTH=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

echo "→ POST /v1/auth/session (create/return user)"
curl -s -X POST "$BASE/v1/auth/session" "${AUTH[@]}" | jq '{id: .user.id, created}'

echo "→ PATCH /v1/me — core birth data with EXACT time"
curl -s -X PATCH "$BASE/v1/me" "${AUTH[@]}" -d '{
  "displayName": "Aanya Sharma",
  "gender": "female",
  "dateOfBirth": "1995-04-12",
  "timeOfBirth": "06:30:00",
  "birthTimeAccuracy": "exact",
  "birthTimeSource": "birth_certificate",
  "placeOfBirth": { "name": "Mumbai, Maharashtra, India", "lat": 19.076, "lon": 72.8777, "tz": "Asia/Kolkata", "countryCode": "IN" }
}' | jq '{displayName, profileCompletedAt, birthTimeAccuracy}'

echo "→ PATCH /v1/me — astrology preferences (Vedic + Western union)"
curl -s -X PATCH "$BASE/v1/me" "${AUTH[@]}" -d '{
  "preferredSystem": "vedic",
  "preferredAyanamsa": "lahiri",
  "preferredHouseSystem": "whole_sign",
  "preferredChartStyle": "north_indian",
  "preferredDashaSystem": "vimshottari",
  "preferredNodeType": "mean"
}' | jq '{preferredSystem, preferredAyanamsa, preferredChartStyle}'

echo "→ PATCH /v1/me — residence, locale, interests, notifications"
curl -s -X PATCH "$BASE/v1/me" "${AUTH[@]}" -d '{
  "currentLocation": { "name": "Bengaluru, India", "lat": 12.9716, "lon": 77.5946, "tz": "Asia/Kolkata" },
  "locale": "en-IN",
  "contentLanguage": "hi-IN",
  "interestAreas": ["career", "love", "health"],
  "relationshipStatus": "single",
  "dailyHoroscopeSendHourLocal": "08:00:00",
  "notificationPrefs": { "dailyHoroscope": { "push": true }, "marketing": { "push": false } },
  "onboardingStatus": "completed"
}' | jq '{currentTimezone, locale, interestAreas, onboardingStatus}'

echo "→ PATCH /v1/me — consent (translated to timestamps + audit log)"
curl -s -X PATCH "$BASE/v1/me" "${AUTH[@]}" -d '{
  "consent": {
    "terms": { "version": "2026-06-01" },
    "privacy": { "version": "2026-06-01" },
    "dataProcessing": true,
    "marketing": true,
    "whatsapp": true
  }
}' | jq '{termsAcceptedAt, dataProcessingConsentAt, marketingConsentAt, whatsappOptInAt}'

echo "→ GET /v1/me"
curl -s "$BASE/v1/me" "${AUTH[@]}" | jq '{displayName, profileCompletedAt, preferredSystem, currentTimezone}'

echo "→ POST /v1/birth-profiles — a partner for Kundli matching (time unknown)"
BP_ID="$(curl -s -X POST "$BASE/v1/birth-profiles" "${AUTH[@]}" -d '{
  "relationship": "prospective_match",
  "displayName": "Rahul",
  "gender": "male",
  "dateOfBirth": "1992-11-03",
  "birthTimeAccuracy": "unknown",
  "placeOfBirth": { "name": "Pune, India", "lat": 18.5204, "lon": 73.8567, "tz": "Asia/Kolkata" },
  "addedWithConsent": true
}' | jq -r '.id')"
echo "   created birth_profile id=$BP_ID"

echo "→ GET /v1/birth-profiles (list)"
curl -s "$BASE/v1/birth-profiles" "${AUTH[@]}" | jq 'map({id, displayName, relationship, birthTimeAccuracy})'

echo "→ PATCH /v1/birth-profiles/$BP_ID — add the recalled exact time"
curl -s -X PATCH "$BASE/v1/birth-profiles/$BP_ID" "${AUTH[@]}" -d '{
  "timeOfBirth": "14:15:00", "birthTimeAccuracy": "approximate"
}' | jq '{id, timeOfBirth, birthTimeAccuracy}'

echo "→ POST /v1/device-tokens — register a push token"
curl -s -X POST "$BASE/v1/device-tokens" "${AUTH[@]}" -d '{
  "token": "fcm-demo-token-abc123",
  "platform": "android",
  "deviceId": "pixel-8-001",
  "locale": "en-IN",
  "pushEnabled": true
}' | jq '{id, platform, deviceId}'

echo "→ DELETE /v1/birth-profiles/$BP_ID (soft-delete)"
curl -s -o /dev/null -w "   HTTP %{http_code}\n" -X DELETE "$BASE/v1/birth-profiles/$BP_ID" "${AUTH[@]}"

echo "✓ done"
