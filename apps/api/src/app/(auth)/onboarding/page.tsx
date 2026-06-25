'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { INDIAN_CITIES } from '@aroha-astrology/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '@/store/useStore';
import { usePlaceSearch, dedupeApiAgainstCities } from '@/hooks/usePlaceSearch';

const WA_BG     = '#11131A';                        // obsidian page
const WA_HEADER = '#15161E';                        // elevated surface
const WA_BOT    = '#1D1F26';                        // bot bubble
const WA_USER   = 'rgba(212,175,55,0.14)';          // user bubble (gold tint)
const WA_GREEN  = '#D4AF37';                        // gold accent
const WA_TEXT   = '#E1E2EB';                        // primary text
const WA_SUB    = '#D0C5AF';                        // muted warm
const WA_BORDER = 'rgba(248,249,250,0.10)';
const WA_INPUT  = 'rgba(29,31,38,0.9)';
const WA_USER_BORDER = 'rgba(212,175,55,0.28)';

type CityData = (typeof INDIAN_CITIES)[0];
type Message = { id: number; from: 'bot' | 'user'; text: string; time: string };
type UserDetails = {
  language: string;
  name: string;
  dob: string;
  tob: string;
  timeSource: string;
  place: string;
  gender: string;
  marital_status: string;
};

const LANGUAGES = [
  { code: 'en', label: 'English',    native: 'English' },
  { code: 'hi', label: 'Hindi',      native: 'हिन्दी' },
  { code: 'bn', label: 'Bengali',    native: 'বাংলা' },
  { code: 'ta', label: 'Tamil',      native: 'தமிழ்' },
  { code: 'te', label: 'Telugu',     native: 'తెలుగు' },
  { code: 'mr', label: 'Marathi',    native: 'मराठी' },
  { code: 'gu', label: 'Gujarati',   native: 'ગુજરાતી' },
  { code: 'kn', label: 'Kannada',    native: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'Malayalam',  native: 'മലയാളം' },
];

const TIME_SOURCES = ['Birth Certificate', 'Family', 'Memory', 'Hospital Record', 'Approximate'];
const TIME_SOURCE_MAP: Record<string, string> = {
  'Birth Certificate': 'certificate',
  'Family': 'family',
  'Memory': 'approximate',
  'Hospital Record': 'hospital',
  'Approximate': 'approximate',
};
const GENDERS = ['Male', 'Female', 'Other'];
const MARITAL_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'dating', label: 'In a relationship' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'married', label: 'Married' },
  { value: 'separated_divorced', label: 'Separated / Divorced' },
  { value: 'widowed', label: 'Widowed' },
];

function delay(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

function normaliseDob(input: string): string {
  const t = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return t;
}

function normaliseTob(input: string): string {
  const t = input.trim();
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function msgTime() {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// Steps: Q1=language, Q2=name, Q3=dob, Q4=tob, Q5=timeSource, Q6=place, Q7=gender

export default function OnboardingPage() {
  const router = useRouter();
  const setLanguage = useStore((s) => s.setLanguage);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState(1);
  const [textInput, setTextInput] = useState('');
  const [userDetails, setUserDetails] = useState<UserDetails>({
    language: 'en', name: '', dob: '', tob: '', timeSource: '', place: '', gender: '', marital_status: '',
  });
  const [selectedCity, setSelectedCity] = useState<CityData | null>(null);
  const [step, setStep] = useState<'chat' | 'confirm' | 'loading'>('chat');
  const [editingPlace, setEditingPlace] = useState(false);
  const [botTyping, setBotTyping] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  const {
    cityQuery, setCityQuery, isPincode,
    cityMatches, apiResults, apiLoading,
  } = usePlaceSearch();

  const extraApiResults = isPincode ? [] : dedupeApiAgainstCities(apiResults, cityMatches);

  useEffect(() => {
    if (apiResults.length > 0) setShowCityDropdown(true);
  }, [apiResults]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await delay(500);
      if (cancelled) return;
      addBotMsg('Namaste! Welcome to Aroha Astrology 🌟');

      await delay(300);
      if (cancelled) return;
      setBotTyping(true);
      await delay(1300);
      if (cancelled) return;
      setBotTyping(false);
      addBotMsg("I need a few details to create your personalised cosmic profile. Let's start!");

      await delay(300);
      if (cancelled) return;
      setBotTyping(true);
      await delay(1000);
      if (cancelled) return;
      setBotTyping(false);
      addBotMsg('Which language do you prefer?');
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, botTyping]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(e.target as Node)) {
        setShowCityDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  function addBotMsg(text: string) {
    setMessages((prev) => [...prev, { id: prev.length + 1, from: 'bot', text, time: msgTime() }]);
  }

  function addUserMsg(text: string) {
    setMessages((prev) => [...prev, { id: prev.length + 1, from: 'user', text, time: msgTime() }]);
  }

  async function typeBot(text: string, ms = 1000) {
    setBotTyping(true);
    await delay(ms);
    setBotTyping(false);
    addBotMsg(text);
  }

  const isValidDOB = (s: string) => {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return false;
    const [, dd, mm, yyyy] = m;
    const d = +dd, mo = +mm, y = +yyyy;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    if (y < 1900 || y > new Date().getFullYear()) return false;
    const dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  };

  const isValidTOB = (s: string) => {
    const m = s.match(/^(\d{2}):(\d{2})$/);
    if (!m) return false;
    const h = +m[1], mi = +m[2];
    return h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
  };

  const handleLanguageSelect = async (code: string, label: string) => {
    const display = code === 'en' ? 'English' : `${LANGUAGES.find(l => l.code === code)?.native} (${label})`;
    addUserMsg(display);
    const newDetails = { ...userDetails, language: code };
    setUserDetails(newDetails);
    setQuestion(2);

    // Immediately persist language preference and update UI
    setLanguage(code);
    fetch('/api/user/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: code }),
    }).catch(() => {});

    await typeBot("What is your full name?", 900);
  };

  const handleTextAnswer = async () => {
    const val = textInput.trim();
    if (!val) return;

    if (question === 3 && !isValidDOB(val)) {
      addUserMsg(val);
      setTextInput('');
      await typeBot("That date doesn't look right. Please enter in DD/MM/YYYY format (e.g. 17/04/1993).", 700);
      return;
    }
    if (question === 4 && !isValidTOB(val)) {
      addUserMsg(val);
      setTextInput('');
      await typeBot("That time doesn't look right. Please enter in HH:MM 24-hour format (e.g. 14:30).", 700);
      return;
    }

    addUserMsg(val);
    setTextInput('');
    const nextQ = question + 1;
    setQuestion(nextQ);
    const newDetails = { ...userDetails };
    if (question === 2) newDetails.name = val;
    else if (question === 3) newDetails.dob = val;
    else if (question === 4) newDetails.tob = val;
    setUserDetails(newDetails);

    if (nextQ === 3) await typeBot(`Nice to meet you, ${val}! When were you born? (DD/MM/YYYY)`, 900);
    else if (nextQ === 4) await typeBot('What time were you born? (e.g. 14:30)', 900);
    else if (nextQ === 5) await typeBot('How do you know your birth time?', 900);
  };

  const handleOptionAnswer = async (value: string, field: 'timeSource' | 'gender') => {
    addUserMsg(value);
    const stored =
      field === 'timeSource'
        ? (TIME_SOURCE_MAP[value] ?? 'family')
        : value.toLowerCase().replace(/\s+/g, '_');
    const newDetails = { ...userDetails, [field]: stored };
    setUserDetails(newDetails);
    const nextQ = question + 1;
    setQuestion(nextQ);

    if (nextQ === 6) await typeBot('Where were you born? Search your city below:', 900);
    else if (nextQ === 7) await typeBot('What is your gender?', 900);
    else if (nextQ === 8) await typeBot('What is your relationship status?', 900);
  };

  const handleMaritalSelect = async (value: string) => {
    addUserMsg(MARITAL_OPTIONS.find(o => o.value === value)?.label ?? value);
    const newDetails = { ...userDetails, marital_status: value };
    setUserDetails(newDetails);
    setQuestion(9);
    await delay(450);
    setStep('confirm');
  };

  const handleConfirmLanguage = (code: string) => {
    setUserDetails((prev) => ({ ...prev, language: code }));
    setLanguage(code);
    fetch('/api/user/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: code }),
    }).catch(() => {});
  };

  const handleConfirmDob = (raw: string) => {
    const d = raw.replace(/\D/g, '').slice(0, 8);
    let out = d.slice(0, 2);
    if (d.length > 2) out += '/' + d.slice(2, 4);
    if (d.length > 4) out += '/' + d.slice(4, 8);
    setUserDetails((prev) => ({ ...prev, dob: out }));
  };

  const handleConfirmTob = (raw: string) => {
    const d = raw.replace(/\D/g, '').slice(0, 4);
    let out = d.slice(0, 2);
    if (d.length > 2) out += ':' + d.slice(2, 4);
    setUserDetails((prev) => ({ ...prev, tob: out }));
  };

  const handleConfirmPlaceSelect = (city: CityData) => {
    setSelectedCity(city);
    setUserDetails((prev) => ({ ...prev, place: city.name }));
    setCityQuery('');
    setShowCityDropdown(false);
    setEditingPlace(false);
  };

  const isConfirmValid = !!(
    userDetails.name.trim() &&
    isValidDOB(userDetails.dob) &&
    isValidTOB(userDetails.tob) &&
    userDetails.timeSource &&
    userDetails.place &&
    userDetails.gender &&
    userDetails.marital_status &&
    selectedCity
  );

  const handleConfirmSubmit = () => {
    if (!isConfirmValid) {
      toast.error('Please complete all fields correctly before continuing.');
      return;
    }
    finishOnboarding(userDetails);
  };

  const handleCitySelect = async (city: CityData) => {
    setCityQuery('');
    setShowCityDropdown(false);
    addUserMsg(`${city.name}, ${city.state}`);
    setSelectedCity(city);
    setUserDetails((prev) => ({ ...prev, place: city.name }));
    setQuestion(7);
    await typeBot('What is your gender?', 900);
  };

  const finishOnboarding = async (details: UserDetails) => {
    setStep('loading');
    try {
      const city =
        selectedCity ??
        INDIAN_CITIES.find((c) => c.name.toLowerCase() === details.place.toLowerCase()) ??
        INDIAN_CITIES.find((c) => c.name.toLowerCase().includes(details.place.toLowerCase())) ??
        INDIAN_CITIES[0];

      const dob = normaliseDob(details.dob);
      const tob = normaliseTob(details.tob);
      const gender = (['male', 'female', 'other'].includes(details.gender.toLowerCase())
        ? details.gender.toLowerCase()
        : 'male') as 'male' | 'female' | 'other';

      const res = await fetch('/api/kundli/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: details.name,
          dob,
          tob,
          tobSource: details.timeSource || 'family',
          pob: `${city.name}, ${city.state}`,
          latitude: city.latitude,
          longitude: city.longitude,
          timezone: city.timezone,
          gender,
          isPrimary: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        console.error('[onboarding] kundli generation failed', err);
        toast.error("We couldn't generate your Kundli yet — you can complete it from the dashboard.");
      } else {
        try {
          const json = (await res.json()) as { data?: { chartId?: string } };
          const chartId = json?.data?.chartId;
          if (chartId) {
            void fetch('/api/queue/enqueue-onboarding', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chartId }),
            }).catch(() => {});
          }
        } catch { /* ignore */ }

        if (details.marital_status) {
          void fetch('/api/user/life-context', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ marital_status: details.marital_status }),
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[onboarding] finish threw', e);
    }
    router.push('/dashboard');
  };

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: WA_BG }}>
        <div className="flex flex-col items-center gap-6">
          {/* gold ring spinner */}
          <div
            className="w-20 h-20 rounded-full"
            style={{
              borderWidth: 3,
              borderStyle: 'solid',
              borderColor: 'rgba(212,175,55,0.18)',
              borderTopColor: '#D4AF37',
              animation: 'spin 1s linear infinite',
              boxShadow: '0 0 24px rgba(212,175,55,0.25)',
            }}
          />
          <div className="text-center">
            <h3 className="text-2xl font-bold mb-2" style={{ color: '#E1E2EB', fontFamily: 'var(--font-display)' }}>
              Analysing Your Chart
            </h3>
            <p className="text-sm" style={{ color: '#D0C5AF' }}>Creating your personalised cosmic profile…</p>
          </div>
          <div className="flex gap-2 mt-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: '#D4AF37', animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (step === 'confirm') {
    const dobError = userDetails.dob && !isValidDOB(userDetails.dob) ? 'Use DD/MM/YYYY' : '';
    const tobError = userDetails.tob && !isValidTOB(userDetails.tob) ? 'Use HH:MM (24h)' : '';
    const labelStyle = { color: WA_SUB, letterSpacing: '0.05em' };
    const inputStyle = { backgroundColor: WA_INPUT, color: WA_TEXT, border: `1px solid ${WA_BORDER}` };

    return (
      <div className="min-h-screen flex flex-col" style={{ background: WA_BG }}>
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ backgroundColor: WA_HEADER, borderBottom: `1px solid ${WA_BORDER}` }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#D4AF37,#7C3AED)' }}
          >
            ✦
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold" style={{ color: WA_TEXT, fontFamily: 'var(--font-display)' }}>
              Confirm Your Details
            </h2>
            <p className="text-xs mt-0.5" style={{ color: WA_SUB }}>
              Tap any field to edit, then confirm to cast your chart
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Language */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={labelStyle}>Language</label>
            <select
              value={userDetails.language}
              onChange={(e) => handleConfirmLanguage(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
              style={inputStyle}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} style={{ backgroundColor: WA_INPUT }}>
                  {l.native} ({l.label})
                </option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={labelStyle}>Full Name</label>
            <input
              type="text"
              value={userDetails.name}
              onChange={(e) => setUserDetails((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
              style={inputStyle}
              placeholder="Your full name"
            />
          </div>

          {/* DOB */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={labelStyle}>Date of Birth</label>
            <input
              type="text"
              inputMode="numeric"
              value={userDetails.dob}
              onChange={(e) => handleConfirmDob(e.target.value)}
              maxLength={10}
              placeholder="DD/MM/YYYY"
              className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
              style={inputStyle}
            />
            {dobError && <p className="text-xs" style={{ color: '#FF7B7B' }}>{dobError}</p>}
          </div>

          {/* TOB */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={labelStyle}>Time of Birth</label>
            <input
              type="text"
              inputMode="numeric"
              value={userDetails.tob}
              onChange={(e) => handleConfirmTob(e.target.value)}
              maxLength={5}
              placeholder="HH:MM (24h)"
              className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
              style={inputStyle}
            />
            {tobError && <p className="text-xs" style={{ color: '#FF7B7B' }}>{tobError}</p>}
          </div>

          {/* Time Source */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={labelStyle}>Birth Time Source</label>
            <select
              value={userDetails.timeSource}
              onChange={(e) => setUserDetails((prev) => ({ ...prev, timeSource: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
              style={inputStyle}
            >
              {TIME_SOURCES.map((src) => (
                <option key={src} value={TIME_SOURCE_MAP[src]} style={{ backgroundColor: WA_INPUT }}>{src}</option>
              ))}
            </select>
          </div>

          {/* Place */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={labelStyle}>Place of Birth</label>
            {!editingPlace ? (
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 px-3 py-2.5 rounded-xl text-sm truncate"
                  style={inputStyle}
                >
                  {selectedCity ? `${selectedCity.name}, ${selectedCity.state}` : (userDetails.place || '—')}
                </div>
                <button
                  type="button"
                  onClick={() => { setEditingPlace(true); setCityQuery(''); setShowCityDropdown(false); }}
                  className="px-3 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.97]"
                  style={{ backgroundColor: WA_BOT, color: WA_GREEN, border: `1px solid ${WA_BORDER}` }}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative" ref={cityDropdownRef}>
                <input
                  type="text"
                  value={cityQuery}
                  onChange={(e) => { setCityQuery(e.target.value); setShowCityDropdown(true); }}
                  onFocus={() => { if (cityMatches.length > 0 || apiResults.length > 0) setShowCityDropdown(true); }}
                  placeholder="City, area, or 6-digit pincode…"
                  className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                  style={inputStyle}
                  autoFocus
                />
                {apiLoading && (
                  <div
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full"
                    style={{
                      borderWidth: 2,
                      borderStyle: 'solid',
                      borderColor: 'rgba(255,255,255,0.15)',
                      borderTopColor: WA_GREEN,
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                )}
                <AnimatePresence>
                  {showCityDropdown && (cityMatches.length > 0 || apiResults.length > 0) && (
                    <motion.div
                      className="absolute top-full left-0 right-0 mt-2 rounded-2xl overflow-hidden shadow-2xl z-50 max-h-64 overflow-y-auto"
                      style={{ backgroundColor: WA_HEADER, border: `1px solid ${WA_BORDER}` }}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                    >
                      {(isPincode ? apiResults : [...cityMatches, ...extraApiResults]).map((city, idx) => (
                        <button
                          key={`cf-${idx}-${city.name}-${city.state}`}
                          type="button"
                          onClick={() => handleConfirmPlaceSelect(city)}
                          className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors"
                          style={{ borderBottom: `1px solid ${WA_BORDER}`, color: WA_TEXT, backgroundColor: 'transparent' }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = WA_BOT)}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <span className="text-sm font-medium">{city.name}</span>
                          <span className="text-xs" style={{ color: WA_SUB }}>{city.state}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
                <button
                  type="button"
                  onClick={() => { setEditingPlace(false); setCityQuery(''); setShowCityDropdown(false); }}
                  className="mt-2 text-xs underline"
                  style={{ color: WA_SUB }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Gender */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={labelStyle}>Gender</label>
            <div className="grid grid-cols-3 gap-2">
              {GENDERS.map((g) => {
                const isSelected = userDetails.gender === g.toLowerCase();
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setUserDetails((prev) => ({ ...prev, gender: g.toLowerCase() }))}
                    className="py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.97]"
                    style={{
                      backgroundColor: isSelected ? 'rgba(212,175,55,0.18)' : WA_BOT,
                      color: WA_TEXT,
                      border: `1px solid ${isSelected ? WA_GREEN : WA_BORDER}`,
                    }}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Marital Status */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={labelStyle}>Relationship Status</label>
            <select
              value={userDetails.marital_status}
              onChange={(e) => setUserDetails((prev) => ({ ...prev, marital_status: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
              style={inputStyle}
            >
              {MARITAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} style={{ backgroundColor: WA_INPUT }}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-4 py-3"
          style={{ backgroundColor: WA_HEADER, borderTop: `1px solid ${WA_BORDER}` }}
        >
          <button
            type="button"
            onClick={handleConfirmSubmit}
            disabled={!isConfirmValid}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ backgroundColor: WA_GREEN, color: '#0a0a0a' }}
          >
            Confirm & Continue ✨
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: WA_BG }}>
      {/* WhatsApp-style header */}
      <div className="flex items-center gap-3 px-4 py-2.5" style={{ backgroundColor: WA_HEADER }}>
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-lg"
          style={{ background: 'linear-gradient(135deg,#7A96AB,#3D5A6E)' }}
        >
          ✦
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: WA_TEXT }}>Aroha Astrology</h3>
          <p className="text-xs transition-colors" style={{ color: botTyping ? WA_GREEN : WA_SUB }}>
            {botTyping ? 'typing...' : 'Setting up your profile'}
          </p>
        </div>
        {/* Progress dots — 8 steps */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((q) => (
            <div
              key={q}
              className="rounded-full transition-all duration-300"
              style={{
                width: q < question ? 8 : 5,
                height: q < question ? 8 : 5,
                backgroundColor: q < question ? WA_GREEN : 'rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5" style={{ background: WA_BG }}>
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            className={`flex items-end gap-1.5 ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
          >
            {msg.from === 'bot' && (
              <div
                className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs mb-0.5"
                style={{ background: 'linear-gradient(135deg,#D4AF37,#7C3AED)', flexShrink: 0 }}
              >
                ✦
              </div>
            )}
            <div
              className="max-w-[75%] px-3 py-2 text-sm leading-relaxed"
              style={{
                backgroundColor: msg.from === 'user' ? WA_USER : WA_BOT,
                border: msg.from === 'user' ? `1px solid ${WA_USER_BORDER}` : `1px solid ${WA_BORDER}`,
                color: WA_TEXT,
                borderRadius: msg.from === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
              }}
            >
              {msg.text}
              <div className="mt-0.5 text-right" style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                {msg.time}
              </div>
            </div>
          </motion.div>
        ))}

        {/* Typing indicator */}
        <AnimatePresence>
          {botTyping && (
            <motion.div
              className="flex items-end gap-1.5"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
            >
              <div
                className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs"
                style={{ background: 'linear-gradient(135deg,#7A96AB,#3D5A6E)' }}
              >
                ✦
              </div>
              <div
                className="px-4 py-3 flex items-center gap-1"
                style={{ backgroundColor: WA_BOT, borderRadius: '12px 12px 12px 3px' }}
              >
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: WA_SUB }}
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 0.55, repeat: Infinity, delay: i * 0.18 }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-3 py-2 space-y-2" style={{ backgroundColor: WA_HEADER }}>

        {/* Q1 — language selection */}
        {question === 1 && (
          <div className="grid grid-cols-3 gap-2 pb-1">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageSelect(lang.code, lang.label)}
                className="flex flex-col items-center px-2 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.97]"
                style={{ backgroundColor: WA_BOT, color: WA_TEXT, border: `1px solid ${WA_BORDER}` }}
              >
                <span className="text-base font-semibold leading-tight">{lang.native}</span>
                {lang.code !== 'en' && (
                  <span className="text-xs mt-0.5" style={{ color: WA_SUB }}>{lang.label}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Q5 — time source */}
        {question === 5 && (
          <div className="grid grid-cols-2 gap-2 pb-1">
            {TIME_SOURCES.map((src) => (
              <button
                key={src}
                onClick={() => handleOptionAnswer(src, 'timeSource')}
                className="px-3 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.97]"
                style={{ backgroundColor: WA_BOT, color: WA_TEXT, border: `1px solid ${WA_BORDER}` }}
              >
                {src}
              </button>
            ))}
          </div>
        )}

        {/* Q6 — city search with dropdown */}
        {question === 6 && (
          <div className="pb-1" ref={cityDropdownRef}>
            <div className="relative">
              <input
                type="text"
                value={cityQuery}
                onChange={(e) => { setCityQuery(e.target.value); setShowCityDropdown(true); }}
                onFocus={() => { if (cityMatches.length > 0 || apiResults.length > 0) setShowCityDropdown(true); }}
                placeholder="City, area name, or 6-digit pincode..."
                className="w-full px-4 py-3 rounded-full text-sm focus:outline-none"
                style={{ backgroundColor: WA_INPUT, color: WA_TEXT, border: `1px solid ${WA_BORDER}` }}
                autoFocus
              />
              {apiLoading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full"
                  style={{ borderWidth: 2, borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.15)', borderTopColor: WA_GREEN, animation: 'spin 0.8s linear infinite' }}
                />
              )}
              <AnimatePresence>
                {showCityDropdown && (cityMatches.length > 0 || apiResults.length > 0) && (
                  <motion.div
                    className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl overflow-hidden shadow-2xl z-50 max-h-64 overflow-y-auto"
                    style={{ backgroundColor: WA_HEADER, border: `1px solid ${WA_BORDER}` }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.18 }}
                  >
                    {isPincode ? (
                      apiResults.map((city) => (
                        <button
                          key={`p-${city.name}-${city.state}`}
                          type="button"
                          onClick={() => handleCitySelect(city)}
                          className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors"
                          style={{ borderBottom: `1px solid ${WA_BORDER}`, color: WA_TEXT, backgroundColor: 'transparent' }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = WA_BOT)}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <span className="text-sm font-medium">{city.name}</span>
                          <span className="text-xs" style={{ color: WA_SUB }}>{city.state}</span>
                        </button>
                      ))
                    ) : (
                      <>
                        {cityMatches.map((city) => (
                          <button
                            key={`c-${city.name}-${city.state}`}
                            type="button"
                            onClick={() => handleCitySelect(city)}
                            className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors"
                            style={{ borderBottom: `1px solid ${WA_BORDER}`, color: WA_TEXT, backgroundColor: 'transparent' }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = WA_BOT)}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                          >
                            <span className="text-sm font-medium">{city.name}</span>
                            <span className="text-xs" style={{ color: WA_SUB }}>{city.state}</span>
                          </button>
                        ))}
                        {extraApiResults.length > 0 && (
                          <div
                            className="px-4 py-1.5 text-[10px] uppercase tracking-wider"
                            style={{ backgroundColor: WA_BG, color: WA_SUB, borderBottom: `1px solid ${WA_BORDER}`, letterSpacing: '0.08em' }}
                          >
                            From pincode directory
                          </div>
                        )}
                        {extraApiResults.map((city, idx) => (
                          <button
                            key={`a-${idx}-${city.name}-${city.state}`}
                            type="button"
                            onClick={() => handleCitySelect(city)}
                            className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors"
                            style={{ borderBottom: `1px solid ${WA_BORDER}`, color: WA_TEXT, backgroundColor: 'transparent' }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = WA_BOT)}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                          >
                            <span className="text-sm font-medium">{city.name}</span>
                            <span className="text-xs" style={{ color: WA_SUB }}>{city.state}</span>
                          </button>
                        ))}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Q7 — gender */}
        {question === 7 && (
          <div className="flex gap-2 pb-1">
            {GENDERS.map((g) => (
              <button
                key={g}
                onClick={() => handleOptionAnswer(g, 'gender')}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.97]"
                style={{ backgroundColor: WA_BOT, color: WA_TEXT, border: `1px solid ${WA_BORDER}` }}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {/* Q2–4 — text / date / time (all typeable) */}
        {question >= 2 && question <= 4 && (
          <div className="flex gap-2 items-center">
            <input
              ref={inputRef}
              type="text"
              inputMode={question === 3 || question === 4 ? 'numeric' : 'text'}
              value={textInput}
              onChange={(e) => {
                const raw = e.target.value;
                if (question === 3) {
                  const d = raw.replace(/\D/g, '').slice(0, 8);
                  let out = d.slice(0, 2);
                  if (d.length > 2) out += '/' + d.slice(2, 4);
                  if (d.length > 4) out += '/' + d.slice(4, 8);
                  setTextInput(out);
                } else if (question === 4) {
                  const d = raw.replace(/\D/g, '').slice(0, 4);
                  let out = d.slice(0, 2);
                  if (d.length > 2) out += ':' + d.slice(2, 4);
                  setTextInput(out);
                } else {
                  setTextInput(raw);
                }
              }}
              maxLength={question === 3 ? 10 : question === 4 ? 5 : undefined}
              onKeyDown={(e) => e.key === 'Enter' && handleTextAnswer()}
              placeholder={question === 2 ? 'Type your name…' : question === 3 ? 'DD/MM/YYYY' : 'HH:MM (24h)'}
              className="flex-1 px-4 py-3 rounded-full text-sm focus:outline-none"
              style={{ backgroundColor: WA_INPUT, color: WA_TEXT, border: `1px solid ${WA_BORDER}` }}
            />
            <button
              onClick={handleTextAnswer}
              disabled={!textInput.trim()}
              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: WA_GREEN }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        )}

        {/* Q8 — marital status */}
        {question === 8 && (
          <div className="grid grid-cols-2 gap-2 pb-1">
            {MARITAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleMaritalSelect(opt.value)}
                className="px-3 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.97]"
                style={{ backgroundColor: WA_BOT, color: WA_TEXT, border: `1px solid ${WA_BORDER}` }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {question > 8 && (
          <p className="text-center text-sm py-2" style={{ color: WA_SUB }}>Just a moment…</p>
        )}
      </div>
    </div>
  );
}
