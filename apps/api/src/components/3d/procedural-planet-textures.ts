'use client';

import * as THREE from 'three';
import type { PlanetKey } from './planet-registry';

const TEX_W = 1024;
const TEX_H = 512;

const cache = new Map<PlanetKey, THREE.CanvasTexture>();

const urlCache = new Map<PlanetKey, string>();
export function getPlanetDataUrl(key: PlanetKey): string | null {
  if (typeof document === 'undefined') return null;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const tex = getPlanetTexture(key);
  if (!tex) return null;
  const url = (tex.image as HTMLCanvasElement).toDataURL();
  urlCache.set(key, url);
  return url;
}

export function getPlanetTexture(key: PlanetKey): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  PAINTERS[key](ctx);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const blob = (ctx: CanvasRenderingContext2D, cx: number, cy: number, rad: number, rgb: [number, number, number], peak: number) => {
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
  grad.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${peak})`);
  grad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fill();
};

function paintSun(ctx: CanvasRenderingContext2D) {
  // Base: realistic solar gradient — white-yellow equator, darker poles.
  const baseGrad = ctx.createLinearGradient(0, 0, 0, TEX_H);
  baseGrad.addColorStop(0, '#B8681A');
  baseGrad.addColorStop(0.2, '#D8942A');
  baseGrad.addColorStop(0.5, '#FFDE4A');
  baseGrad.addColorStop(0.8, '#D8942A');
  baseGrad.addColorStop(1, '#B8681A');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  const r = mulberry(101);

  // Supergranules — broad warm pools.
  for (let i = 0; i < 20; i++) {
    blob(ctx, r() * TEX_W, r() * TEX_H, 50 + r() * 80, [255, 235, 140], 0.15 + r() * 0.15);
  }

  // Primary granulation — very fine, dense bright cells (4500 granules).
  for (let i = 0; i < 4500; i++) {
    blob(ctx, r() * TEX_W, r() * TEX_H, 2 + r() * 5, [255, 250, 200], 0.40 + r() * 0.35);
  }

  // Primary intergranular lanes — dark network (3200 lanes).
  for (let i = 0; i < 3200; i++) {
    blob(ctx, r() * TEX_W, r() * TEX_H, 2 + r() * 4, [165, 65, 18], 0.35 + r() * 0.28);
  }

  // Secondary granulation layer — ultra-fine detail (2000 more granules).
  for (let i = 0; i < 2000; i++) {
    blob(ctx, r() * TEX_W, r() * TEX_H, 1.5 + r() * 3, [255, 245, 180], 0.22 + r() * 0.18);
  }

  // Secondary intergranular lanes — fine dark streaks (1600 lanes).
  for (let i = 0; i < 1600; i++) {
    blob(ctx, r() * TEX_W, r() * TEX_H, 1.5 + r() * 2.5, [140, 50, 12], 0.20 + r() * 0.15);
  }

  // Faculae — bright streamers, very abundant (280+).
  for (let i = 0; i < 280; i++) {
    const x = r() * TEX_W;
    const y = r() * TEX_H;
    const len = 8 + r() * 40;
    ctx.fillStyle = `rgba(255, 245, 210, ${0.18 + r() * 0.22})`;
    ctx.beginPath();
    ctx.ellipse(x, y, len, 1 + r() * 2.5, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hot bright spots — brightest photosphere regions (100 spots).
  for (let i = 0; i < 100; i++) {
    blob(ctx, r() * TEX_W, r() * TEX_H, 4 + r() * 8, [255, 255, 220], 0.55 + r() * 0.28);
  }

  // Sunspots — dark features (5-6).
  for (let i = 0; i < 6; i++) {
    const x = TEX_W * (0.1 + r() * 0.8);
    const y = TEX_H * (0.25 + r() * 0.5);
    const spotR = 12 + r() * 20;
    blob(ctx, x, y, spotR, [110, 50, 16], 0.82);
    blob(ctx, x, y, spotR * 0.52, [20, 8, 4], 0.93);
  }
}

function paintMoon(ctx: CanvasRenderingContext2D) {
  // Moon: bright terrae (highlands) base.
  ctx.fillStyle = '#D0D8E0';
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  const r = mulberry(202);

  // Maria (dark seas) — large dark patches.
  for (let i = 0; i < 25; i++) {
    const x = r() * TEX_W;
    const y = r() * TEX_H;
    const rad = 40 + r() * 100;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(60, 68, 85, 0.75)');
    grad.addColorStop(1, 'rgba(60, 68, 85, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Major craters — large with central peaks.
  for (let i = 0; i < 80; i++) {
    const x = r() * TEX_W;
    const y = r() * TEX_H;
    const rad = 6 + r() * 18;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(40, 45, 55, 0.6)');
    grad.addColorStop(0.7, 'rgba(80, 90, 105, 0.5)');
    grad.addColorStop(1, 'rgba(80, 90, 105, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crater rays — bright streaks from major impacts.
  for (let i = 0; i < 60; i++) {
    const x = r() * TEX_W;
    const y = r() * TEX_H;
    const len = 20 + r() * 80;
    ctx.strokeStyle = `rgba(220, 228, 240, ${0.25 + r() * 0.3})`;
    ctx.lineWidth = 1 + r() * 2;
    ctx.beginPath();
    const ang = r() * Math.PI * 2;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  // Small crater field.
  for (let i = 0; i < 300; i++) {
    blob(ctx, r() * TEX_W, r() * TEX_H, 1.5 + r() * 3.5, [50, 55, 65], 0.45 + r() * 0.35);
  }
}

function paintMercury(ctx: CanvasRenderingContext2D) {
  // Mercury: heavily cratered dark gray.
  ctx.fillStyle = '#7A8899';
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  const r = mulberry(303);

  // Heavily cratered field — many overlapping impacts.
  for (let i = 0; i < 500; i++) {
    const x = r() * TEX_W;
    const y = r() * TEX_H;
    const rad = 2 + r() * 8;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(40, 45, 55, 0.7)');
    grad.addColorStop(1, 'rgba(40, 45, 55, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Escarpments (subtle ridges).
  for (let i = 0; i < 40; i++) {
    const x = r() * TEX_W;
    const y = r() * TEX_H;
    const len = 30 + r() * 100;
    ctx.strokeStyle = `rgba(50, 55, 65, ${0.3 + r() * 0.25})`;
    ctx.lineWidth = 0.5 + r() * 1.5;
    ctx.beginPath();
    const ang = r() * Math.PI * 2;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
}

function paintMars(ctx: CanvasRenderingContext2D) {
  const bands: ReadonlyArray<readonly [string, number, number]> = [
    ['#C66B40', 0.0, 0.12],
    ['#D17852', 0.12, 0.3],
    ['#BC4A28', 0.3, 0.5],
    ['#D8794A', 0.5, 0.68],
    ['#C66B40', 0.68, 0.85],
    ['#9D3A1D', 0.85, 1.0],
  ];
  for (const [col, y0, y1] of bands) {
    ctx.fillStyle = col;
    ctx.fillRect(0, y0 * TEX_H, TEX_W, (y1 - y0) * TEX_H);
  }

  const r = mulberry(404);

  // Polar ice caps.
  ctx.fillStyle = 'rgba(255, 240, 220, 0.95)';
  ctx.beginPath();
  ctx.ellipse(TEX_W / 2, 10, TEX_W * 0.48, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(TEX_W / 2, TEX_H - 10, TEX_W * 0.42, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dust storms — tan swirls.
  for (let i = 0; i < 180; i++) {
    const x = r() * TEX_W;
    const y = r() * TEX_H;
    const w = 15 + r() * 50;
    const h = 3 + r() * 8;
    ctx.fillStyle = `rgba(220, 180, 120, ${0.15 + r() * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Canyons and valleys — darker streaks.
  for (let i = 0; i < 90; i++) {
    const x = r() * TEX_W;
    const y = r() * TEX_H;
    const len = 25 + r() * 80;
    ctx.strokeStyle = `rgba(80, 30, 15, ${0.25 + r() * 0.3})`;
    ctx.lineWidth = 1 + r() * 2;
    ctx.beginPath();
    const ang = r() * Math.PI * 2;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  // Crater impacts.
  for (let i = 0; i < 120; i++) {
    blob(ctx, r() * TEX_W, r() * TEX_H, 3 + r() * 6, [70, 25, 12], 0.4 + r() * 0.3);
  }
}

function paintVenus(ctx: CanvasRenderingContext2D) {
  // Venus: thick, bright, opaque clouds. Very yellow-orange.
  const grad = ctx.createLinearGradient(0, 0, 0, TEX_H);
  grad.addColorStop(0, '#E8B842');
  grad.addColorStop(0.3, '#F0C858');
  grad.addColorStop(0.5, '#FFF5A0');
  grad.addColorStop(0.7, '#F0C858');
  grad.addColorStop(1, '#E8B842');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  const r = mulberry(606);

  // Cloud bands — very prominent.
  for (let i = 0; i < 8; i++) {
    const y0 = (i / 8) * TEX_H;
    const h = TEX_H / 10;
    const alpha = 0.2 + r() * 0.25;
    ctx.fillStyle = `rgba(180, 120, 50, ${alpha})`;
    ctx.fillRect(0, y0, TEX_W, h);
  }

  // Swirling cloud masses.
  for (let i = 0; i < 300; i++) {
    const x = r() * TEX_W;
    const y = r() * TEX_H;
    const w = 25 + r() * 120;
    const h = 4 + r() * 15;
    ctx.fillStyle = `rgba(255, 235, 190, ${0.12 + r() * 0.22})`;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Darker cloud bands.
  for (let i = 0; i < 180; i++) {
    const x = r() * TEX_W;
    const y = r() * TEX_H;
    const w = 18 + r() * 80;
    const h = 2 + r() * 8;
    ctx.fillStyle = `rgba(140, 85, 35, ${0.1 + r() * 0.15})`;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintJupiter(ctx: CanvasRenderingContext2D) {
  const bands: ReadonlyArray<readonly [string, number, number]> = [
    ['#D8A957', 0.0, 0.09],
    ['#8B6B47', 0.09, 0.16],
    ['#E8C589', 0.16, 0.24],
    ['#B8956B', 0.24, 0.35],
    ['#F5DBAA', 0.35, 0.44],
    ['#9A7B5A', 0.44, 0.54],
    ['#E0BA88', 0.54, 0.62],
    ['#7A5A3A', 0.62, 0.72],
    ['#F0D8B8', 0.72, 0.82],
    ['#A89070', 0.82, 0.90],
    ['#D8A957', 0.90, 1.0],
  ];
  for (const [col, y0, y1] of bands) {
    ctx.fillStyle = col;
    ctx.fillRect(0, y0 * TEX_H, TEX_W, (y1 - y0) * TEX_H);
  }
  const r = mulberry(505);

  // Cloud texture on bands.
  for (let i = 0; i < 2000; i++) {
    const y = r() * TEX_H;
    const x = r() * TEX_W;
    const w = 20 + r() * 60;
    ctx.fillStyle = `rgba(255, 245, 200, ${r() * 0.08})`;
    ctx.fillRect(x, y, w, 1.5);
  }

  // Great Red Spot — larger and more prominent.
  const spotGrad = ctx.createRadialGradient(
    TEX_W * 0.65, TEX_H * 0.60, 6,
    TEX_W * 0.65, TEX_H * 0.60, 95,
  );
  spotGrad.addColorStop(0, 'rgba(220, 90, 60, 0.95)');
  spotGrad.addColorStop(0.55, 'rgba(170, 60, 40, 0.75)');
  spotGrad.addColorStop(1, 'rgba(170, 60, 40, 0)');
  ctx.fillStyle = spotGrad;
  ctx.beginPath();
  ctx.ellipse(TEX_W * 0.65, TEX_H * 0.60, 95, 42, 0, 0, Math.PI * 2);
  ctx.fill();

  // Storm systems — darker ovals.
  for (let i = 0; i < 8; i++) {
    const x = TEX_W * (0.15 + r() * 0.7);
    const y = TEX_H * (0.25 + r() * 0.5);
    const w = 40 + r() * 50;
    const h = 12 + r() * 20;
    ctx.fillStyle = `rgba(60, 35, 20, ${0.3 + r() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintSaturn(ctx: CanvasRenderingContext2D) {
  const bands: ReadonlyArray<readonly [string, number, number]> = [
    ['#D0B88A', 0.0, 0.2],
    ['#A89370', 0.2, 0.35],
    ['#D8C49A', 0.35, 0.5],
    ['#B8A085', 0.5, 0.65],
    ['#D8C49A', 0.65, 0.8],
    ['#A89370', 0.8, 1.0],
  ];
  for (const [col, y0, y1] of bands) {
    ctx.fillStyle = col;
    ctx.fillRect(0, y0 * TEX_H, TEX_W, (y1 - y0) * TEX_H);
  }
  const r = mulberry(707);

  // Subtle cloud detail.
  for (let i = 0; i < 1200; i++) {
    const y = r() * TEX_H;
    const x = r() * TEX_W;
    const w = 18 + r() * 50;
    ctx.fillStyle = `rgba(255, 245, 210, ${r() * 0.05})`;
    ctx.fillRect(x, y, w, 1);
  }

  // Subtle storms.
  for (let i = 0; i < 3; i++) {
    const x = TEX_W * (0.2 + r() * 0.6);
    const y = TEX_H * (0.3 + r() * 0.4);
    blob(ctx, x, y, 30 + r() * 40, [80, 50, 25], 0.25 + r() * 0.2);
  }
}

function paintShadow(
  ctx: CanvasRenderingContext2D,
  base: string,
  swirl: [number, number, number],
  seed: number,
) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  const r = mulberry(seed);

  // Swirling vortex patterns — more dynamic.
  for (let i = 0; i < 350; i++) {
    const x = r() * TEX_W;
    const y = r() * TEX_H;
    const rad = 20 + r() * 110;
    blob(ctx, x, y, rad, swirl, 0.16 + r() * 0.32);
  }

  // Comet-like trails.
  for (let i = 0; i < 140; i++) {
    const x = r() * TEX_W;
    const y = r() * TEX_H;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.22 + r() * 0.28})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 22 + r() * 70, 5 + r() * 18, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintRahu(ctx: CanvasRenderingContext2D) {
  paintShadow(ctx, '#1A0E2F', [144, 80, 224], 808);
}

function paintKetu(ctx: CanvasRenderingContext2D) {
  paintShadow(ctx, '#2A0814', [224, 80, 107], 909);
}

function paintEarth(ctx: CanvasRenderingContext2D) {
  const baseGrad = ctx.createLinearGradient(0, 0, 0, TEX_H);
  baseGrad.addColorStop(0,   '#0D2137');
  baseGrad.addColorStop(0.2, '#143259');
  baseGrad.addColorStop(0.5, '#1B4E8A');
  baseGrad.addColorStop(0.8, '#143259');
  baseGrad.addColorStop(1,   '#0D2137');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  const r = mulberry(1337);

  const lands: [number, number, number, number][] = [
    [0.22, 0.42, 95, 75],
    [0.52, 0.38, 80, 60],
    [0.62, 0.55, 55, 45],
    [0.80, 0.52, 45, 35],
    [0.30, 0.68, 50, 30],
  ];
  for (const [cxf, cyf, rx, ry] of lands) {
    const cx = cxf * TEX_W, cy = cyf * TEX_H;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
    g.addColorStop(0,   'rgba(78,102,48,0.92)');
    g.addColorStop(0.6, 'rgba(58,78,32,0.75)');
    g.addColorStop(1,   'rgba(58,78,32,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, r() * 0.8, 0, Math.PI * 2);
    ctx.fill();
    blob(ctx, cx - rx*0.2, cy - ry*0.2, Math.min(rx,ry)*0.5, [100,130,55], 0.35 + r()*0.2);
    for (let i = 0; i < 4; i++)
      blob(ctx, cx+(r()-0.5)*rx*1.2, cy+(r()-0.5)*ry*1.2, 10+r()*20, [45,55,28], 0.4+r()*0.25);
  }

  for (let i = 0; i < 8; i++) {
    const [cxf, cyf, rx, ry] = lands[Math.floor(r() * lands.length)];
    blob(ctx, cxf*TEX_W+(r()-0.5)*rx*0.9, cyf*TEX_H+(r()-0.5)*ry*0.9,
         30+r()*50, [28,100,140], 0.25+r()*0.18);
  }

  const ng = ctx.createLinearGradient(0,0,0,TEX_H*0.18);
  ng.addColorStop(0,'rgba(220,235,245,0.90)'); ng.addColorStop(1,'rgba(220,235,245,0)');
  ctx.fillStyle = ng; ctx.fillRect(0,0,TEX_W,TEX_H*0.18);
  const sg = ctx.createLinearGradient(0,TEX_H*0.82,0,TEX_H);
  sg.addColorStop(0,'rgba(220,235,245,0)'); sg.addColorStop(1,'rgba(220,235,245,0.95)');
  ctx.fillStyle = sg; ctx.fillRect(0,TEX_H*0.82,TEX_W,TEX_H*0.18);

  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(230,242,255,${0.20+r()*0.35})`;
    ctx.beginPath();
    ctx.ellipse(r()*TEX_W, (0.30+r()*0.40)*TEX_H, 40+r()*160, 3+r()*9, (r()-0.5)*0.4, 0, Math.PI*2);
    ctx.fill();
  }
  for (let i = 0; i < 25; i++)
    blob(ctx, r()*TEX_W, (0.20+r()*0.60)*TEX_H, 25+r()*55, [225,240,255], 0.25+r()*0.30);
}

const PAINTERS: Record<PlanetKey, (ctx: CanvasRenderingContext2D) => void> = {
  Sun: paintSun,
  Moon: paintMoon,
  Mercury: paintMercury,
  Mars: paintMars,
  Jupiter: paintJupiter,
  Venus: paintVenus,
  Saturn: paintSaturn,
  Rahu: paintRahu,
  Ketu: paintKetu,
  Earth: paintEarth,
};
