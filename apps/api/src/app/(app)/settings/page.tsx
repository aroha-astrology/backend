'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { isNative } from '@/lib/native';
import { MotionPage, StaggerList, StaggerItem } from '@/components/ui/motion-primitives';
import { useUpdateSettingsMutation } from '@/hooks/queries/useUserSettingsQuery';

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'mr', label: 'Marathi' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'bn', label: 'Bengali' },
];

const ayanamsaOptions = [
  { value: 'lahiri', label: 'Lahiri (Chitrapaksha)' },
  { value: 'krishnamurti', label: 'Krishnamurti (KP)' },
  { value: 'raman', label: 'Raman' },
];

export default function SettingsPage() {
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const chartStyle = useStore((s) => s.chartStyle);
  const setChartStyle = useStore((s) => s.setChartStyle);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [ayanamsa, setAyanamsa] = useState('lahiri');
  const [notifications, setNotifications] = useState({
    dailyHoroscope: true,
    panchangAlerts: true,
    muhurtaReminders: false,
    promotional: false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const updateSettings = useUpdateSettingsMutation();

  // Personal context
  const [profession, setProfession] = useState(user?.profession ?? '');
  const [marital, setMarital] = useState(user?.marital_status ?? '');
  const [financial, setFinancial] = useState(user?.financial_status ?? '');
  const [contextSaving, setContextSaving] = useState(false);
  const [contextSaved, setContextSaved] = useState(false);

  // Reflect store updates if AuthProvider populates user after this page mounts.
  useEffect(() => {
    if (user?.name) setName(user.name);
    if (user?.email) setEmail(user.email);
    if (user?.profession != null) setProfession(user.profession ?? '');
    if (user?.marital_status != null) setMarital(user.marital_status ?? '');
    if (user?.financial_status != null) setFinancial(user.financial_status ?? '');
  }, [user]);

  const handleSaveContext = async () => {
    const payload: Record<string, string> = {};
    if (profession.trim()) payload.profession = profession.trim();
    if (marital) payload.marital_status = marital;
    if (financial) payload.financial_status = financial;
    if (Object.keys(payload).length === 0) return;
    setContextSaving(true);
    try {
      const res = await fetch('/api/user/life-context', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      if (user) setUser({ ...user, ...payload, life_context_updated_at: new Date().toISOString() } as typeof user);
      setContextSaved(true);
      setTimeout(() => setContextSaved(false), 3000);
    } catch { /* ignore */ } finally { setContextSaving(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateSettings.mutateAsync({ name, language, chart_style: chartStyle, ayanamsa, theme, notifications });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  const handleLogout = async () => {
    try { await fetch('/api/auth/signout', { method: 'POST' }); } catch { /* ignore */ }
    window.location.href = '/';
  };

  const maritalOptions = [
    { value: 'single', label: 'Single' },
    { value: 'dating', label: 'Dating' },
    { value: 'engaged', label: 'Engaged' },
    { value: 'married', label: 'Married' },
    { value: 'separated_divorced', label: 'Separated · Divorced' },
    { value: 'widowed', label: 'Widowed' },
  ];

  const financialOptions = [
    { value: 'tight', label: 'Tight' },
    { value: 'stable', label: 'Stable' },
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'prefer_not_to_say', label: 'Prefer not to say' },
  ];

  const themeOptions: { value: 'dark' | 'light' | 'premium'; label: string; icon: string; disabled: boolean }[] = [
    { value: 'dark', label: 'Dark', icon: '🌙', disabled: false },
    { value: 'light', label: 'Light', icon: '☀️', disabled: false },
    { value: 'premium', label: 'Premium Gold', icon: '✨', disabled: false },
  ];

  const Toggle = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
    <button
      onClick={onToggle}
      className={`relative w-11 h-6 rounded-full border-none cursor-pointer transition-colors duration-200 flex-shrink-0 ${
        on ? 'bg-primary' : 'bg-surface-2'
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full shadow-md transition-[left] duration-200 ${
          on ? 'left-[22px] bg-bg' : 'left-0.5 bg-white'
        }`}
      />
    </button>
  );

  return (
    <MotionPage className="min-h-screen px-4 pt-6 pb-20">
      <div className="max-w-[600px] mx-auto">
        <h1 className="text-xl font-extrabold text-text mb-6 font-[family-name:var(--font-serif)]">Settings</h1>

        <StaggerList className="flex flex-col gap-3">

          {/* Account */}
          <StaggerItem>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3.5 border-b border-border">
                <p className="text-[13px] font-semibold text-text">Account</p>
              </div>
              <div className="p-4 flex flex-col gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full bg-surface-2 border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-text outline-none opacity-50 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your display name"
                    className="w-full bg-surface-2 border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-text outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              </div>
            </div>
          </StaggerItem>

          {/* Personal Context */}
          <StaggerItem>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3.5 border-b border-border">
                <p className="text-[13px] font-semibold text-text">Personal Context</p>
                <p className="text-[11px] text-text-secondary mt-0.5">Used to personalise your daily reading. Nothing is mandatory.</p>
              </div>
              <div className="p-4 flex flex-col gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                    Profession
                  </label>
                  <input
                    type="text"
                    value={profession}
                    onChange={e => setProfession(e.target.value)}
                    placeholder="e.g. software engineer, homemaker…"
                    className="w-full bg-surface-2 border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-text outline-none focus:border-primary/50 transition-colors placeholder:text-text-muted"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-2">
                    Relationship Status
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {maritalOptions.map(o => (
                      <button
                        key={o.value}
                        onClick={() => setMarital(m => m === o.value ? '' : o.value)}
                        className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
                          marital === o.value
                            ? 'bg-primary text-white border-primary'
                            : 'bg-bg border-border text-text-muted'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-2">
                    Financial Situation
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {financialOptions.map(o => (
                      <button
                        key={o.value}
                        onClick={() => setFinancial(f => f === o.value ? '' : o.value)}
                        className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
                          financial === o.value
                            ? 'bg-primary text-white border-primary'
                            : 'bg-bg border-border text-text-muted'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleSaveContext}
                  disabled={contextSaving}
                  className={`w-full py-2.5 rounded-xl text-[13px] font-bold transition-all ${
                    contextSaved ? 'bg-emerald-500/80 text-white' : 'bg-primary/10 border border-primary/30 text-primary'
                  } ${contextSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {contextSaving ? 'Saving…' : contextSaved ? '✓ Saved!' : 'Save Context'}
                </button>
              </div>
            </div>
          </StaggerItem>

          {/* Theme */}
          <StaggerItem>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3.5 border-b border-border">
                <p className="text-[13px] font-semibold text-text">Theme</p>
              </div>
              <div className="p-4 flex gap-2.5">
                {themeOptions.map((t) => (
                  <button
                    key={t.value}
                    disabled={t.disabled}
                    onClick={() => !t.disabled && setTheme(t.value)}
                    className={`flex-1 py-3 px-2 rounded-lg border flex flex-col items-center gap-1.5 transition-colors ${
                      theme === t.value
                        ? 'border-primary/50 bg-primary/[0.08]'
                        : 'border-border bg-transparent'
                    } ${t.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                  >
                    <span className="text-lg">{t.icon}</span>
                    <span className={`text-[11px] font-medium ${theme === t.value ? 'text-primary' : 'text-text-secondary'}`}>
                      {t.label}
                      {t.disabled && <span className="block text-[9px]">Premium</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </StaggerItem>

          {/* Language */}
          <StaggerItem>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3.5 border-b border-border">
                <p className="text-[13px] font-semibold text-text">Language</p>
              </div>
              <div className="p-4">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-text outline-none appearance-none bg-no-repeat bg-[length:16px] bg-[position:right_12px_center] pr-10 cursor-pointer focus:border-primary/50 transition-colors"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748B'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                  }}
                >
                  {languageOptions.map((o) => (
                    <option key={o.value} value={o.value} className="bg-surface">{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </StaggerItem>

          {/* Chart Style */}
          <StaggerItem>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3.5 border-b border-border">
                <p className="text-[13px] font-semibold text-text">Chart Style</p>
              </div>
              <div className="p-4 grid grid-cols-2 gap-3">
                {(['north', 'south'] as const).map((style) => (
                  <button
                    key={style}
                    onClick={() => setChartStyle(style)}
                    className={`p-4 rounded-lg cursor-pointer border text-center transition-colors ${
                      chartStyle === style
                        ? 'border-primary/50 bg-primary/[0.06]'
                        : 'border-border bg-transparent'
                    }`}
                  >
                    <div className="w-[60px] h-[60px] mx-auto mb-2 border border-white/20 grid grid-cols-4 grid-rows-4">
                      {Array.from({ length: 16 }).map((_, i) => (
                        <div key={i} className="border border-white/10" />
                      ))}
                    </div>
                    <p className={`text-[11px] font-medium ${chartStyle === style ? 'text-primary' : 'text-text-secondary'}`}>
                      {style === 'north' ? 'North Indian' : 'South Indian'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </StaggerItem>

          {/* Ayanamsa */}
          <StaggerItem>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3.5 border-b border-border">
                <p className="text-[13px] font-semibold text-text">Ayanamsa</p>
              </div>
              <div className="p-4">
                <select
                  value={ayanamsa}
                  onChange={(e) => setAyanamsa(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-text outline-none appearance-none bg-no-repeat bg-[length:16px] bg-[position:right_12px_center] pr-10 cursor-pointer focus:border-primary/50 transition-colors"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748B'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                  }}
                >
                  {ayanamsaOptions.map((o) => (
                    <option key={o.value} value={o.value} className="bg-surface">{o.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-text-secondary mt-2">
                  Determines the reference point for zodiac calculations.
                </p>
              </div>
            </div>
          </StaggerItem>

          {/* Notifications */}
          <StaggerItem>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3.5 border-b border-border">
                <p className="text-[13px] font-semibold text-text">Notifications</p>
              </div>
              <div className="py-2">
                {[
                  { key: 'dailyHoroscope' as const, label: 'Daily Horoscope', desc: 'Get your daily cosmic forecast' },
                  { key: 'panchangAlerts' as const, label: 'Panchang Alerts', desc: 'Auspicious timing notifications' },
                  { key: 'muhurtaReminders' as const, label: 'Muhurta Reminders', desc: 'Set reminders for auspicious times' },
                  { key: 'promotional' as const, label: 'Promotional Offers', desc: 'Credits deals and special offers' },
                ].map((item, i, arr) => (
                  <div
                    key={item.key}
                    className={`flex items-center justify-between px-4 py-3 ${
                      i < arr.length - 1 ? 'border-b border-white/[0.04]' : ''
                    }`}
                  >
                    <div>
                      <p className="text-[12px] font-medium text-text">{item.label}</p>
                      <p className="text-[11px] text-text-secondary mt-px">{item.desc}</p>
                    </div>
                    <Toggle
                      on={notifications[item.key]}
                      onToggle={() => setNotifications((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </StaggerItem>

          {/* App permissions — Android only */}
          {isNative() && (
            <StaggerItem>
              <AppPermissions />
            </StaggerItem>
          )}

          {/* Save button */}
          <StaggerItem>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`w-full py-3.5 border-none rounded-xl text-[13px] font-bold transition-all duration-200 mb-3 ${
                saved
                  ? 'bg-emerald-500/80 text-white'
                  : 'bg-primary text-bg'
              } ${saving ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
            >
              {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Changes'}
            </button>
          </StaggerItem>

          {/* Danger Zone */}
          <StaggerItem>
            <div className="bg-surface border border-red-500/20 rounded-xl overflow-hidden">
              <div className="px-4 py-3.5 border-b border-red-500/15">
                <p className="text-[13px] font-semibold text-red-500">Danger Zone</p>
              </div>
              <div className="p-4">
                <button
                  onClick={handleLogout}
                  className="w-full py-3 bg-red-500/[0.08] border border-red-500/30 rounded-lg text-[12px] font-semibold text-red-500 cursor-pointer"
                >
                  🚪 Sign Out
                </button>
              </div>
            </div>
          </StaggerItem>

        </StaggerList>
      </div>
    </MotionPage>
  );
}

// ─── App Permissions (Android only) ─────────────────────────────────────────

function AppPermissions() {
  const [perms, setPerms] = useState<Record<string, string>>({
    notifications: 'unknown',
    location: 'unknown',
    camera: 'unknown',
    microphone: 'unknown',
  });

  useEffect(() => {
    async function check() {
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const { Camera } = await import('@capacitor/camera');
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');

        const [loc, cam, notif, mic] = await Promise.all([
          Geolocation.checkPermissions(),
          Camera.checkPermissions(),
          PushNotifications.checkPermissions(),
          SpeechRecognition.checkPermissions(),
        ]);

        setPerms({
          notifications: (notif as any).receive ?? 'unknown',
          location: (loc as any).location ?? 'unknown',
          camera: (cam as any).camera ?? 'unknown',
          microphone: (mic as any).speechRecognition ?? 'unknown',
        });
      } catch { /* not native */ }
    }
    check();
  }, []);

  const openSettings = async () => {
    try {
      const { App } = await import('@capacitor/app');
      // @ts-expect-error — openSettings is available in Capacitor App plugin
      await App.openSettings?.();
    } catch { /* ignore */ }
  };

  const rows = [
    { key: 'notifications', label: 'Notifications', desc: 'Receive report-ready alerts' },
    { key: 'location', label: 'Location', desc: 'Auto-fill city for transit & panchang' },
    { key: 'camera', label: 'Camera', desc: 'Capture palm photos' },
    { key: 'microphone', label: 'Microphone', desc: 'Speak questions in chat' },
  ];

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border">
        <p className="text-[13px] font-semibold text-text">App Permissions</p>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row) => {
          const state = perms[row.key];
          const granted = state === 'granted';
          return (
            <div key={row.key} className="px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium text-text">{row.label}</p>
                <p className="text-[11px] text-text-secondary mt-px">{row.desc}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[11px] font-medium ${granted ? 'text-emerald-500' : 'text-warning'}`}>
                  {granted ? '✓ Granted' : state === 'unknown' ? '…' : 'Denied'}
                </span>
                {!granted && state !== 'unknown' && (
                  <button
                    onClick={openSettings}
                    className="text-[11px] px-2 py-1 rounded-lg bg-primary/10 border border-primary/30 text-primary font-medium"
                  >
                    Open settings
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
