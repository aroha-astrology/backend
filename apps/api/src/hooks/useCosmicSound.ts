'use client';
import { useCallback } from 'react';

// Each sign's planetary ruler maps to a solfeggio-adjacent frequency
const SIGN_FREQ: Record<string, number> = {
  Aries: 480,       // Mars  — dynamic red
  Taurus: 417,      // Venus — sweet amber
  Gemini: 528,      // Mercury — bright (love freq)
  Cancer: 396,      // Moon  — soft silver
  Leo: 440,         // Sun   — golden concert A
  Virgo: 528,       // Mercury
  Libra: 417,       // Venus
  Scorpio: 432,     // Mars/Ketu — deep cosmic
  Sagittarius: 384, // Jupiter — expansive
  Capricorn: 288,   // Saturn — deep earth
  Aquarius: 432,    // Saturn/Rahu — cosmic
  Pisces: 396,      // Jupiter — dreamy
};

export function useCosmicSound() {
  const playNotificationSound = useCallback((sign?: string) => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const base = (sign ? SIGN_FREQ[sign] : undefined) ?? 432;
      const now = ctx.currentTime;

      // Tibetan singing bowl layers: [frequency, amplitude, decay-seconds]
      const layers: [number, number, number][] = [
        [base,          0.36, 3.8],   // fundamental
        [base * 2.756,  0.13, 2.2],   // 2nd mode
        [base * 5.404,  0.04, 1.4],   // 3rd mode
        [base * 0.5,    0.07, 3.0],   // sub-octave undertone
      ];

      layers.forEach(([freq, amp, decay]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(amp, now + 0.012); // mallet strike
        gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + decay + 0.1);
      });

      // Transient noise burst — the physical "strike" character
      const bufLen = Math.floor(ctx.sampleRate * 0.06);
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 2.5);
      }
      const noise = ctx.createBufferSource();
      const nf = ctx.createBiquadFilter();
      const ng = ctx.createGain();
      nf.type = 'bandpass';
      nf.frequency.value = base * 1.5;
      nf.Q.value = 0.9;
      ng.gain.setValueAtTime(0.18, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      noise.buffer = buf;
      noise.connect(nf);
      nf.connect(ng);
      ng.connect(ctx.destination);
      noise.start(now);
    } catch {
      // Audio APIs unavailable (SSR, incognito, etc.)
    }
  }, []);

  return { playNotificationSound };
}
