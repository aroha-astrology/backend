'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { INDIAN_CITIES, type CityData } from '@aroha-astrology/shared';
import { getTimeConfidenceIndicator } from '@/lib/utils';
import { MotionPage, FadeIn } from '@/components/ui/motion-primitives';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { useStore } from '@/store/useStore';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlaceSearch, dedupeApiAgainstCities } from '@/hooks/usePlaceSearch';

type TimeSource = 'hospital' | 'certificate' | 'family' | 'approximate' | 'unknown';
type Gender = 'male' | 'female' | 'other';

interface BirthDetails {
  name: string;
  dob: string;
  tob: string;
  tobSource: TimeSource;
  pob: string;
  latitude: number;
  longitude: number;
  timezone: string;
  gender: Gender;
}

interface AdditionalDetails {
  primaryConcern: string;
  maritalStatus: string;
  employment: string;
  healthConcerns: string;
  familyType: string;
  birthOrder: string;
  specificQuestion: string;
}

const TIME_SOURCE_OPTIONS = [
  { value: 'hospital', label: 'Hospital Record' },
  { value: 'certificate', label: 'Birth Certificate' },
  { value: 'family', label: 'Family Member' },
  { value: 'approximate', label: 'Approximate' },
  { value: 'unknown', label: 'Unknown / Not Sure' },
];

const CONCERN_OPTIONS = [
  { value: '', label: 'Select concern...' },
  { value: 'career', label: 'Career & Professional Growth' },
  { value: 'marriage', label: 'Marriage & Relationships' },
  { value: 'health', label: 'Health & Wellness' },
  { value: 'wealth', label: 'Wealth & Finance' },
  { value: 'children', label: 'Children & Family' },
  { value: 'education', label: 'Education & Learning' },
];

const MARITAL_OPTIONS = [
  { value: '', label: 'Select status...' },
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'divorced', label: 'Divorced' },
];

const EMPLOYMENT_OPTIONS = [
  { value: '', label: 'Select status...' },
  { value: 'employed', label: 'Employed' },
  { value: 'unemployed', label: 'Unemployed' },
  { value: 'student', label: 'Student' },
  { value: 'business', label: 'Business / Self-Employed' },
];

const HEALTH_OPTIONS = [
  { value: '', label: 'Select concern...' },
  { value: 'none', label: 'None' },
  { value: 'joint', label: 'Joint / Bone Issues' },
  { value: 'digestive', label: 'Digestive Issues' },
  { value: 'mental', label: 'Mental Health' },
  { value: 'heart', label: 'Heart / Cardiovascular' },
  { value: 'other', label: 'Other' },
];

const FAMILY_TYPE_OPTIONS = [
  { value: '', label: 'Select type...' },
  { value: 'nuclear', label: 'Nuclear Family' },
  { value: 'joint', label: 'Joint Family' },
];

const BIRTH_ORDER_OPTIONS = [
  { value: '', label: 'Select order...' },
  { value: 'first', label: 'First Born' },
  { value: 'middle', label: 'Middle Child' },
  { value: 'last', label: 'Last Born' },
  { value: 'only', label: 'Only Child' },
];


const inputCls = 'w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2.5 text-[13px] text-text outline-none transition-all duration-300 focus:border-[rgba(212, 175, 55,0.55)] focus:ring-2 focus:ring-[rgba(212, 175, 55,0.15)] focus:shadow-[0_0_12px_rgba(212, 175, 55,0.12)] placeholder:text-text-secondary/50';
const labelCls = 'block text-[10px] font-semibold text-text-secondary uppercase tracking-[0.12em] mb-1.5';
const selectCls = `${inputCls} appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23d4a843'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")] bg-no-repeat bg-[right_10px_center] bg-[length:14px] pr-9 cursor-pointer`;

export default function KundliGeneratePage() {
  const router = useRouter();
  const profiles = useStore((s) => s.profiles);
  const charts = useStore((s) => s.charts);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [birth, setBirth] = useState<BirthDetails>({
    name: '', dob: '', tob: '', tobSource: 'family', pob: '',
    latitude: 0, longitude: 0, timezone: '', gender: 'male',
  });

  const [additional, setAdditional] = useState<AdditionalDetails>({
    primaryConcern: '', maritalStatus: '', employment: '',
    healthConcerns: '', familyType: '', birthOrder: '', specificQuestion: '',
  });

  const [harshMode, setHarshMode] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [selectedCity, setSelectedCity] = useState<CityData | null>(null);
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
    function handleClickOutside(e: MouseEvent) {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(e.target as Node)) {
        setShowCityDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCitySelect = useCallback((city: CityData) => {
    setSelectedCity(city);
    setCityQuery(`${city.name}, ${city.state}`);
    setBirth((prev) => ({
      ...prev, pob: `${city.name}, ${city.state}`,
      latitude: city.latitude, longitude: city.longitude, timezone: city.timezone,
    }));
    setShowCityDropdown(false);
    setErrors((prev) => { const n = { ...prev }; delete n.pob; return n; });
  }, []);

  const timeConfidence = getTimeConfidenceIndicator(birth.tobSource);

  // Duplicate detection: find a profile+chart matching name + dob + tob
  const duplicateChart = useMemo(() => {
    if (!birth.name.trim() || !birth.dob || !birth.tob) return null;
    const nameLower = birth.name.trim().toLowerCase();
    const matchedProfile = profiles.find(
      p => p.name.toLowerCase() === nameLower && p.dob === birth.dob && p.tob === birth.tob
    );
    if (!matchedProfile) return null;
    const chart = charts.find(c => c.profile_id === matchedProfile.id);
    return chart ? { chart, profile: matchedProfile } : null;
  }, [birth.name, birth.dob, birth.tob, profiles, charts]);

  const validateStep1 = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!birth.name.trim()) newErrors.name = 'Name is required';
    if (!birth.dob) newErrors.dob = 'Date of birth is required';
    if (!birth.tob) newErrors.tob = 'Time of birth is required';
    if (!selectedCity) newErrors.pob = 'Please select a city from the list';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    setStep((s) => Math.min(s + 1, 3));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const handleSubmit = () => {
    const payload = {
      name: birth.name.trim(), dob: birth.dob, tob: birth.tob,
      tobSource: birth.tobSource, pob: birth.pob,
      latitude: birth.latitude, longitude: birth.longitude, timezone: birth.timezone,
      gender: birth.gender,
      primaryConcern: additional.primaryConcern || undefined,
      maritalStatus: additional.maritalStatus || undefined,
      employment: additional.employment || undefined,
      healthConcerns: additional.healthConcerns || undefined,
      familyType: additional.familyType || undefined,
      birthOrder: additional.birthOrder || undefined,
      specificQuestion: additional.specificQuestion.trim() || undefined,
      harshMode,
    };

    // Store pending state so dashboard shows generating UI
    try {
      localStorage.setItem('jyotish:pendingKundli', JSON.stringify({
        name: birth.name.trim(),
        dob: birth.dob,
        tob: birth.tob,
        timestamp: Date.now(),
      }));
    } catch { /* localStorage unavailable */ }

    // Fire-and-forget — keepalive survives navigation, backend sends kundli_ready when done
    fetch('/api/kundli/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});

    router.push('/dashboard');
  };

  const stepLabels = ['Birth Details', 'Additional Info', 'Preferences'];

  return (
    <>
    <MotionPage className="min-h-screen px-3 pt-5 pb-24">
      <div className="max-w-[640px] mx-auto">

        {/* Page header */}
        <FadeIn className="text-center mb-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3"
            style={{ background: 'rgba(212, 175, 55,0.12)', border: '1px solid rgba(212, 175, 55,0.28)', boxShadow: '0 0 24px rgba(212, 175, 55,0.10)' }}
          >
            🪐
          </div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Vedic Astrology</p>
          <h1 className="text-xl font-bold text-text font-[family-name:var(--font-serif)] tracking-wide">Generate Kundli</h1>
          <p className="text-[12px] text-text-secondary mt-1">
            Swiss Ephemeris precision · AI-powered interpretation
          </p>
        </FadeIn>

        {/* Orbital step indicator */}
        <FadeIn delay={0.1} className="flex items-center justify-center mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div className="relative">
                <motion.div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-bold transition-all relative"
                  style={{
                    backgroundColor: s === step ? 'rgba(212, 175, 55,0.15)' : s < step ? 'rgba(212, 175, 55,0.10)' : 'rgba(0,0,0,0.04)',
                    color: s === step ? 'var(--primary)' : s < step ? 'var(--primary)' : 'var(--text-secondary)',
                    border: s === step ? '2px solid rgba(212, 175, 55,0.70)' : s < step ? '2px solid rgba(212, 175, 55,0.40)' : '1px solid var(--border)',
                    boxShadow: s === step ? '0 0 20px rgba(212, 175, 55,0.30), 0 0 6px rgba(212, 175, 55,0.50)' : 'none',
                  }}
                  animate={s === step ? { scale: [1, 1.06, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  {s < step ? '✓' : s}
                </motion.div>
                {/* Orbiting particle for active step */}
                {s === step && (
                  <motion.div
                    className="absolute inset-0"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                  >
                    <div className="absolute w-[5px] h-[5px] rounded-full" style={{ top: -2, left: '50%', transform: 'translateX(-50%)', background: 'var(--primary)', boxShadow: '0 0 8px rgba(212, 175, 55,0.9)' }} />
                  </motion.div>
                )}
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] font-semibold text-text-secondary whitespace-nowrap">{stepLabels[s - 1]}</span>
              </div>
              {s < 3 && (
                <div className="w-14 h-[2px] rounded-full mx-1" style={{
                  background: s < step ? 'linear-gradient(90deg, rgba(212, 175, 55,0.5), rgba(212, 175, 55,0.2))' : 'rgba(0,0,0,0.08)',
                }} />
              )}
            </div>
          ))}
        </FadeIn>
        <p className="text-center text-[11px] text-text-secondary mb-4 mt-3">
          Step {step} of 3
        </p>

        {/* Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            className="glass-2 rounded-xl p-5"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >

            {/* Step 1: Birth Details */}
            {step === 1 && (
              <div className="flex flex-col gap-4">

                {/* Duplicate chart banner */}
                <AnimatePresence>
                  {duplicateChart && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, y: -4, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="rounded-xl p-3.5 flex items-start gap-3"
                      style={{ background: 'rgba(212, 175, 55,0.07)', border: '1px solid rgba(212, 175, 55,0.30)' }}
                    >
                      <span className="text-xl flex-shrink-0">🪐</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-text mb-0.5">Chart already exists!</p>
                        <p className="text-[11px] text-text-secondary leading-snug">
                          A Kundli for <span className="font-semibold text-primary">{duplicateChart.profile.name}</span> born on {duplicateChart.profile.dob} at {duplicateChart.profile.tob} is already in your account.
                        </p>
                        <p className="text-[11px] text-text-muted mt-2">
                          You can generate a new chart with different details below.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div>
                  <label className={labelCls}>Full Name *</label>
                  <input
                    type="text"
                    placeholder="Enter full name"
                    value={birth.name}
                    onChange={(e) => {
                      setBirth((prev) => ({ ...prev, name: e.target.value }));
                      if (errors.name) setErrors((prev) => { const n = { ...prev }; delete n.name; return n; });
                    }}
                    className={`${inputCls} ${errors.name ? 'border-error/60' : ''}`}
                  />
                  {errors.name && <p className="text-[11px] text-error mt-1">{errors.name}</p>}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className={labelCls}>Date of Birth *</label>
                    <input
                      type="date"
                      value={birth.dob}
                      onChange={(e) => {
                        setBirth((prev) => ({ ...prev, dob: e.target.value }));
                        if (errors.dob) setErrors((prev) => { const n = { ...prev }; delete n.dob; return n; });
                      }}
                      className={`${inputCls} [color-scheme:dark] ${errors.dob ? 'border-error/60' : ''}`}
                    />
                    {errors.dob && <p className="text-[11px] text-error mt-1">{errors.dob}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>Time of Birth *</label>
                    <input
                      type="time"
                      value={birth.tob}
                      onChange={(e) => {
                        setBirth((prev) => ({ ...prev, tob: e.target.value }));
                        if (errors.tob) setErrors((prev) => { const n = { ...prev }; delete n.tob; return n; });
                      }}
                      className={`${inputCls} [color-scheme:dark] ${errors.tob ? 'border-error/60' : ''}`}
                    />
                    {errors.tob && <p className="text-[11px] text-error mt-1">{errors.tob}</p>}
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Time Source</label>
                  <select
                    value={birth.tobSource}
                    onChange={(e) => setBirth((prev) => ({ ...prev, tobSource: e.target.value as TimeSource }))}
                    className={selectCls}
                  >
                    {TIME_SOURCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} className="bg-surface">{o.label}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span>{timeConfidence.emoji}</span>
                    <span className="text-[11px] text-text-secondary">{timeConfidence.label}</span>
                  </div>
                </div>

                {/* Place of Birth */}
                <div ref={cityDropdownRef} className="relative">
                  <label className={labelCls}>Place of Birth *</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="City, area name, or 6-digit pincode (India)"
                      value={cityQuery}
                      onChange={(e) => {
                        setCityQuery(e.target.value);
                        setShowCityDropdown(true);
                        if (selectedCity) {
                          setSelectedCity(null);
                          setBirth((prev) => ({ ...prev, pob: '', latitude: 0, longitude: 0, timezone: '' }));
                        }
                      }}
                      onFocus={() => {
                        if (cityMatches.length > 0 || apiResults.length > 0) setShowCityDropdown(true);
                      }}
                      autoComplete="off"
                      className={`${inputCls} ${errors.pob ? 'border-error/60' : ''}`}
                    />
                    {apiLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Skeleton width={14} height={14} rounded="50%" />
                      </div>
                    )}
                  </div>
                  {errors.pob && <p className="text-[11px] text-error mt-1">{errors.pob}</p>}
                  <AnimatePresence>
                    {showCityDropdown && (cityMatches.length > 0 || apiResults.length > 0) && (
                      <motion.div
                        className="absolute top-full left-0 right-0 z-50 bg-surface border border-border/60 rounded-lg overflow-hidden shadow-2xl mt-1 max-h-72 overflow-y-auto"
                        initial={{ opacity: 0, y: -6, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2 }}
                      >
                        {isPincode ? (
                          apiResults.map((city) => (
                            <button
                              key={`p-${city.name}-${city.state}`}
                              type="button"
                              onClick={() => handleCitySelect(city)}
                              className="flex w-full items-center justify-between py-2 px-3 border-b border-border/30 cursor-pointer bg-transparent text-left hover:bg-surface-hover transition-colors"
                            >
                              <div>
                                <span className="text-[12px] font-medium text-text">{city.name}</span>
                                <span className="text-[11px] text-text-secondary ml-1.5">{city.state}</span>
                              </div>
                              <span className="text-[10px] text-text-secondary">{cityQuery.trim()}</span>
                            </button>
                          ))
                        ) : (
                          <>
                            {cityMatches.map((city) => (
                              <button
                                key={`c-${city.name}-${city.state}`}
                                type="button"
                                onClick={() => handleCitySelect(city)}
                                className="flex w-full items-center justify-between py-2 px-3 border-b border-border/30 cursor-pointer bg-transparent text-left hover:bg-surface-hover transition-colors"
                              >
                                <div>
                                  <span className="text-[12px] font-medium text-text">{city.name}</span>
                                  <span className="text-[11px] text-text-secondary ml-1.5">{city.state}</span>
                                </div>
                                <span className="text-[10px] text-text-secondary">
                                  {`${city.latitude.toFixed(1)}°, ${city.longitude.toFixed(1)}°`}
                                </span>
                              </button>
                            ))}
                            {extraApiResults.length > 0 && (
                              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-text-secondary bg-bg/60 border-b border-border/30">
                                From pincode directory
                              </div>
                            )}
                            {extraApiResults.map((city, idx) => (
                              <button
                                key={`a-${idx}-${city.name}-${city.state}`}
                                type="button"
                                onClick={() => handleCitySelect(city)}
                                className="flex w-full items-center justify-between py-2 px-3 border-b border-border/30 cursor-pointer bg-transparent text-left hover:bg-surface-hover transition-colors"
                              >
                                <div>
                                  <span className="text-[12px] font-medium text-text">{city.name}</span>
                                  <span className="text-[11px] text-text-secondary ml-1.5">{city.state}</span>
                                </div>
                                <span className="text-[10px] text-text-secondary">
                                  {`${city.latitude.toFixed(1)}°, ${city.longitude.toFixed(1)}°`}
                                </span>
                              </button>
                            ))}
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {selectedCity && (
                    <p className="text-[10px] text-text-secondary mt-1">
                      ✓ {selectedCity.latitude}°N, {selectedCity.longitude}°E · {selectedCity.timezone}
                    </p>
                  )}
                </div>

                {/* Gender */}
                <div>
                  <label className={labelCls}>Gender *</label>
                  <div className="flex gap-2">
                    {(['male', 'female', 'other'] as const).map((g) => (
                      <label
                        key={g}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[12px] font-medium cursor-pointer transition-all border ${
                          birth.gender === g
                            ? 'border-[rgba(212, 175, 55,0.55)] bg-[rgba(212, 175, 55,0.10)] text-primary'
                            : 'border-[rgba(0,0,0,0.10)] text-text-secondary hover:border-[rgba(212, 175, 55,0.25)]'
                        }`}
                      >
                        <input
                          type="radio" name="gender" value={g}
                          checked={birth.gender === g}
                          onChange={(e) => setBirth((prev) => ({ ...prev, gender: e.target.value as Gender }))}
                          className="hidden"
                        />
                        <span className="capitalize">{g}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Additional Details */}
            {step === 2 && (
              <div className="flex flex-col gap-4">
                <div className="mb-1">
                  <h3 className="text-[14px] font-semibold text-text font-[family-name:var(--font-serif)]">Additional Details</h3>
                  <p className="text-[12px] text-text-secondary mt-0.5">
                    Optional — improves prediction accuracy. You can skip this step.
                  </p>
                </div>

                <div>
                  <label className={labelCls}>Primary Concern</label>
                  <select value={additional.primaryConcern}
                    onChange={(e) => setAdditional((prev) => ({ ...prev, primaryConcern: e.target.value }))}
                    className={selectCls}
                  >
                    {CONCERN_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-surface">{o.label}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className={labelCls}>Marital Status</label>
                    <select value={additional.maritalStatus}
                      onChange={(e) => setAdditional((prev) => ({ ...prev, maritalStatus: e.target.value }))}
                      className={selectCls}
                    >
                      {MARITAL_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-surface">{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Employment</label>
                    <select value={additional.employment}
                      onChange={(e) => setAdditional((prev) => ({ ...prev, employment: e.target.value }))}
                      className={selectCls}
                    >
                      {EMPLOYMENT_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-surface">{o.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className={labelCls}>Health Concerns</label>
                    <select value={additional.healthConcerns}
                      onChange={(e) => setAdditional((prev) => ({ ...prev, healthConcerns: e.target.value }))}
                      className={selectCls}
                    >
                      {HEALTH_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-surface">{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Family Type</label>
                    <select value={additional.familyType}
                      onChange={(e) => setAdditional((prev) => ({ ...prev, familyType: e.target.value }))}
                      className={selectCls}
                    >
                      {FAMILY_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-surface">{o.label}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Specific Question</label>
                  <textarea
                    rows={3}
                    placeholder="Any specific question? e.g., When will I get promoted?"
                    value={additional.specificQuestion}
                    onChange={(e) => setAdditional((prev) => ({ ...prev, specificQuestion: e.target.value }))}
                    className={`${inputCls} resize-y min-h-[70px]`}
                  />
                </div>
              </div>
            )}

            {/* Step 3: Prediction Style */}
            {step === 3 && (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-[14px] font-semibold text-text font-[family-name:var(--font-serif)]">Prediction Style</h3>
                  <p className="text-[12px] text-text-secondary mt-0.5">Choose how you want your reading delivered.</p>
                </div>

                {/* Harsh mode toggle */}
                <div className={`rounded-xl p-4 border transition-all ${harshMode ? 'border-error/40 bg-error/4' : 'border-border bg-surface-hover/30'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] font-semibold text-text">⚠️ Harsh Mode</h4>
                      <p className="text-[12px] text-text-secondary mt-0.5">
                        Raw, unfiltered predictions. Real challenges with specific timings.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHarshMode((prev) => !prev)}
                      className="w-11 h-6 rounded-full border-none cursor-pointer relative transition-colors shrink-0"
                      style={{ backgroundColor: harshMode ? '#ef4444' : 'rgba(0,0,0,0.10)' }}
                    >
                      <motion.span
                        className="absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow"
                        animate={{ left: harshMode ? 21 : 3 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      />
                    </button>
                  </div>
                  <AnimatePresence>
                    {harshMode && (
                      <motion.div
                        className="mt-2.5 py-2 px-3 bg-error/8 border border-error/20 rounded-lg"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <p className="text-[11px] text-error leading-relaxed">
                          <strong>Warning:</strong> Harsh mode includes difficult truths — potential health issues, relationship challenges, and unfavorable time periods with specific dates.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* What you'll receive */}
                <div className="bg-surface-hover/30 border border-border rounded-xl p-4">
                  <h4 className="text-[12px] font-semibold text-text mb-2.5 font-[family-name:var(--font-serif)]">What you&apos;ll receive:</h4>
                  <motion.div className="flex flex-col gap-1.5" variants={staggerContainer} initial="initial" animate="animate">
                    {[
                      'Complete birth chart with planetary positions',
                      'Vimshottari Dasha timeline for next 15 years',
                      '7 detailed life area predictions',
                      'Dosha analysis (Mangal, Kaal Sarp, Sade Sati)',
                      'Yoga identification and strength',
                      'Vedic remedies and Lal Kitab totke',
                      'Daily, monthly, and yearly guidance',
                    ].map((item) => (
                      <motion.div key={item} variants={staggerItem} className="flex gap-2 items-start">
                        <span className="text-primary text-[12px] mt-0.5 shrink-0">✓</span>
                        <span className="text-[12px] text-text-secondary leading-snug">{item}</span>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {errors.submit && (
            <motion.div
              className="mt-2.5 py-2.5 px-3 bg-error/8 border border-error/30 rounded-lg text-[12px] text-error"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {errors.submit}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4">
          <motion.button
            onClick={handleBack}
            disabled={step === 1}
            className="py-2 px-4 rounded-lg border border-border bg-transparent text-text-secondary text-[12px] font-medium cursor-pointer disabled:cursor-not-allowed"
            style={{ opacity: step === 1 ? 0 : 1 }}
            whileTap={{ scale: 0.97 }}
          >
            ← Back
          </motion.button>

          <div className="flex gap-2">
            {step === 2 && (
              <motion.button
                onClick={() => setStep(3)}
                className="py-2 px-4 rounded-lg border border-border bg-transparent text-text-secondary text-[12px] font-medium cursor-pointer"
                whileTap={{ scale: 0.97 }}
              >
                Skip
              </motion.button>
            )}

            {step < 3 ? (
              <motion.button
                onClick={handleNext}
                className="py-2 px-5 rounded-xl border-none text-[12px] font-bold cursor-pointer"
                style={{ background: 'linear-gradient(90deg, var(--primary-ink), var(--primary))', color: '#0a0600', boxShadow: '0 4px 16px rgba(212, 175, 55,0.25)' }}
                whileTap={{ scale: 0.97 }}
              >
                Next →
              </motion.button>
            ) : (
              <motion.button
                onClick={handleSubmit}
                className="py-2.5 px-6 rounded-xl border-none text-[13px] font-bold cursor-pointer flex items-center gap-2 neon-pulse"
                style={{ background: 'linear-gradient(90deg, var(--primary-ink) 0%, var(--primary) 50%, #f2cc72 100%)', color: '#0a0600', boxShadow: '0 4px 20px rgba(212, 175, 55,0.30)' }}
                whileTap={{ scale: 0.97 }}
              >
                🪐 Generate Kundli
              </motion.button>
            )}
          </div>
        </div>

        <p className="text-center text-[9px] text-text-secondary/35 mt-5">
          Your data is encrypted and stored securely. We never share personal birth details.
        </p>
      </div>
    </MotionPage>
    </>
  );
}
