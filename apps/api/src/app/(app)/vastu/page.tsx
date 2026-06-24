'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem, ScrollReveal } from '@/components/ui/motion-primitives';
import { staggerContainer, staggerItem, cardHover } from '@/lib/motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { Select } from '@/components/ui/select';

/* -------------------------------------------------------------------------- */
/*  Types & Constants                                                         */
/* -------------------------------------------------------------------------- */

type Direction = 'NW' | 'N' | 'NE' | 'W' | 'Center' | 'E' | 'SW' | 'S' | 'SE';

const DIRECTIONS: Direction[] = ['NW', 'N', 'NE', 'W', 'Center', 'E', 'SW', 'S', 'SE'];

const DIRECTION_META: Record<Direction, { label: string; color: string; element: string }> = {
  N:      { label: 'North',       color: '#3b82f6', element: 'Water' },
  NE:     { label: 'North-East',  color: '#06b6d4', element: 'Water+Air' },
  E:      { label: 'East',        color: '#f59e0b', element: 'Fire' },
  SE:     { label: 'South-East',  color: '#ef4444', element: 'Fire' },
  S:      { label: 'South',       color: '#ef4444', element: 'Fire' },
  SW:     { label: 'South-West',  color: '#8b5cf6', element: 'Earth' },
  W:      { label: 'West',        color: '#64748b', element: 'Air' },
  NW:     { label: 'North-West',  color: '#64748b', element: 'Air' },
  Center: { label: 'Brahmasthan', color: '#c9a227', element: 'Space' },
};

interface RoomType { id: string; label: string; emoji: string; color: string; }

const ROOM_TYPES: RoomType[] = [
  { id: 'kitchen',    label: 'Kitchen',    emoji: '🍳', color: '#ef4444' },
  { id: 'master_bed', label: 'Master Bed', emoji: '🛌', color: '#8b5cf6' },
  { id: 'bed_2',      label: 'Bed 2',      emoji: '🛏️', color: '#a78bfa' },
  { id: 'bathroom',   label: 'Bathroom',   emoji: '🚿', color: '#06b6d4' },
  { id: 'puja_room',  label: 'Puja Room',  emoji: '🛕', color: '#f59e0b' },
  { id: 'living',     label: 'Living',     emoji: '🛋️', color: '#3b82f6' },
  { id: 'entrance',   label: 'Entrance',   emoji: '🚪', color: '#22c55e' },
  { id: 'dining',     label: 'Dining',     emoji: '🍽️', color: '#f97316' },
  { id: 'store',      label: 'Store',      emoji: '📦', color: '#78716c' },
  { id: 'kids_room',  label: 'Kids Room',  emoji: '🧒', color: '#ec4899' },
  { id: 'stairs',     label: 'Stairs',     emoji: '🪜', color: '#64748b' },
  { id: 'balcony',    label: 'Balcony',    emoji: '🌅', color: '#0ea5e9' },
  { id: 'parking',    label: 'Parking',    emoji: '🚗', color: '#475569' },
  { id: 'water_tank', label: 'Water Tank', emoji: '💧', color: '#0284c7' },
];

/* Rooms that support interior furniture planning */
const ROOM_FURNITURE: Record<string, Array<{ id: string; label: string; emoji: string }>> = {
  master_bed: [
    { id: 'bed',          label: 'Bed',            emoji: '🛌' },
    { id: 'wardrobe',     label: 'Wardrobe',       emoji: '🗄️' },
    { id: 'study_desk',   label: 'Study Desk',     emoji: '💻' },
    { id: 'mirror',       label: 'Mirror',         emoji: '🪞' },
    { id: 'ac',           label: 'AC Unit',        emoji: '❄️' },
    { id: 'tv',           label: 'Television',     emoji: '📺' },
    { id: 'dresser',      label: 'Dresser',        emoji: '🪑' },
    { id: 'plant',        label: 'Plant',          emoji: '🪴' },
    { id: 'safe',         label: 'Safe / Locker',  emoji: '🔒' },
    { id: 'bookshelf',    label: 'Bookshelf',      emoji: '📚' },
  ],
  bed_2: [
    { id: 'bed',          label: 'Bed',            emoji: '🛌' },
    { id: 'wardrobe',     label: 'Wardrobe',       emoji: '🗄️' },
    { id: 'study_desk',   label: 'Study Desk',     emoji: '💻' },
    { id: 'mirror',       label: 'Mirror',         emoji: '🪞' },
    { id: 'ac',           label: 'AC Unit',        emoji: '❄️' },
    { id: 'tv',           label: 'Television',     emoji: '📺' },
    { id: 'plant',        label: 'Plant',          emoji: '🪴' },
  ],
  kids_room: [
    { id: 'bed',          label: 'Bed',            emoji: '🛌' },
    { id: 'study_desk',   label: 'Study Desk',     emoji: '📚' },
    { id: 'wardrobe',     label: 'Wardrobe',       emoji: '🗄️' },
    { id: 'play_area',    label: 'Play Area',      emoji: '🧸' },
    { id: 'bookshelf',    label: 'Bookshelf',      emoji: '📖' },
    { id: 'tv',           label: 'Television',     emoji: '📺' },
    { id: 'ac',           label: 'AC Unit',        emoji: '❄️' },
    { id: 'mirror',       label: 'Mirror',         emoji: '🪞' },
    { id: 'toy_shelf',    label: 'Toy Shelf',      emoji: '🎯' },
  ],
  living: [
    { id: 'sofa',         label: 'Sofa',           emoji: '🛋️' },
    { id: 'tv',           label: 'Television',     emoji: '📺' },
    { id: 'main_chair',   label: 'Main Seat',      emoji: '🪑' },
    { id: 'plant',        label: 'Plant',          emoji: '🪴' },
    { id: 'bookshelf',    label: 'Bookshelf',      emoji: '📚' },
    { id: 'ac',           label: 'AC Unit',        emoji: '❄️' },
    { id: 'aquarium',     label: 'Aquarium',       emoji: '🐟' },
    { id: 'pooja_shelf',  label: 'Small Puja Shelf', emoji: '🕉️' },
    { id: 'center_table', label: 'Centre Table',   emoji: '☕' },
  ],
  puja_room: [
    { id: 'idol',         label: 'Idol / Altar',   emoji: '🕉️' },
    { id: 'prayer_mat',   label: 'Prayer Mat',     emoji: '🧘' },
    { id: 'lamp',         label: 'Lamp (Diya)',    emoji: '🪔' },
    { id: 'flower_vase',  label: 'Flower Vase',    emoji: '💐' },
    { id: 'water_bowl',   label: 'Water Bowl',     emoji: '🫙' },
    { id: 'incense',      label: 'Incense Stand',  emoji: '🧯' },
    { id: 'bell',         label: 'Bell',           emoji: '🔔' },
  ],
  dining: [
    { id: 'table',        label: 'Dining Table',   emoji: '🍽️' },
    { id: 'head_seat',    label: 'Head Seat',      emoji: '🪑' },
    { id: 'sideboard',    label: 'Sideboard',      emoji: '🗄️' },
    { id: 'water',        label: 'Water Container',emoji: '💧' },
    { id: 'plant',        label: 'Plant',          emoji: '🪴' },
  ],
  kitchen: [
    { id: 'stove',        label: 'Stove / Hob',    emoji: '🔥' },
    { id: 'sink',         label: 'Sink',           emoji: '🚿' },
    { id: 'fridge',       label: 'Refrigerator',   emoji: '🧊' },
    { id: 'microwave',    label: 'Microwave',      emoji: '📡' },
    { id: 'storage',      label: 'Storage Rack',   emoji: '🗄️' },
    { id: 'water_purifier', label: 'Water Purifier', emoji: '💧' },
    { id: 'gas_cylinder', label: 'Gas Cylinder',   emoji: '⛽' },
    { id: 'exhaust',      label: 'Exhaust Fan',    emoji: '💨' },
  ],
  bathroom: [
    { id: 'geyser',       label: 'Geyser / Shower',emoji: '🚿' },
    { id: 'toilet',       label: 'Toilet / WC',    emoji: '🚽' },
    { id: 'basin',        label: 'Wash Basin',     emoji: '🪥' },
    { id: 'mirror',       label: 'Mirror',         emoji: '🪞' },
    { id: 'washing_machine', label: 'Washing Machine', emoji: '🔄' },
    { id: 'storage_rack', label: 'Storage Rack',   emoji: '🗄️' },
  ],
  store: [
    { id: 'shelves',      label: 'Shelves',        emoji: '📦' },
    { id: 'safe',         label: 'Safe / Locker',  emoji: '🔒' },
    { id: 'heavy_items',  label: 'Heavy Items',    emoji: '⚖️' },
    { id: 'water_drum',   label: 'Water Drum',     emoji: '🪣' },
  ],
};

interface Placement { instanceId: string; roomId: string; direction: Direction; }
interface SubQuestion { instanceId: string; roomId: string; question: string; options: string[]; answer: string; }
interface FurniturePlacement { furnitureId: string; direction: Direction; }

const SUB_QUESTIONS: Record<string, { question: string; options: string[] }> = {
  kitchen:    { question: 'Which direction does the gas stove face?', options: ['North', 'South', 'East', 'West'] },
  master_bed: { question: 'Which direction is the bed headboard?', options: ['North', 'South', 'East', 'West'] },
  bed_2:      { question: 'Which direction is the bed headboard?', options: ['North', 'South', 'East', 'West'] },
  puja_room:  { question: 'Which direction do idols face?', options: ['North', 'South', 'East', 'West'] },
  entrance:   { question: 'Which direction does the main door open?', options: ['North', 'South', 'East', 'West', 'North-East', 'North-West'] },
  stairs:     { question: 'Do the stairs turn clockwise or anti-clockwise?', options: ['Clockwise', 'Anti-clockwise', 'Straight'] },
  water_tank: { question: 'Is it overhead or underground?', options: ['Overhead', 'Underground'] },
};

interface RoomAnalysis {
  instanceKey: string; roomId: string; roomLabel: string; currentDirection: string; idealDirection: string;
  score: number; isCorrect: boolean; suggestion: string; remedy?: string; impact?: string; good?: string;
  buyItems?: string[]; highlights?: string[];
}
interface VastuResult { rooms: RoomAnalysis[]; overallScore: number; generalRemedies: string[]; notesAnswer?: string; notesAnswerItems?: string[]; notesQuestion?: string; }

interface PreviousReport {
  id: string;
  room_layout: Record<string, string[]>;
  analysis: Record<string, unknown>;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                 */
/* -------------------------------------------------------------------------- */

export default function VastuPage() {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [instanceCounter, setInstanceCounter] = useState(0);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [subAnswers, setSubAnswers] = useState<SubQuestion[]>([]);

  /* Interior furniture planning */
  const [furniturePlacements, setFurniturePlacements] = useState<Record<string, FurniturePlacement[]>>({});
  const [expandedInterior, setExpandedInterior] = useState<string | null>(null);
  const [selectedFurnitureItem, setSelectedFurnitureItem] = useState<{ instanceId: string; furnitureId: string } | null>(null);

  const [extraNotes, setExtraNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VastuResult | null>(null);
  const [error, setError] = useState('');

  const [previousReports, setPreviousReports] = useState<PreviousReport[]>([]);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [reportsLoading, setReportsLoading] = useState(true);

  // Ask Vastu Expert modal
  const [vastuAskModal, setVastuAskModal] = useState<{
    roomLabel: string;
    roomContent: string;
    qas: Array<{ q: string; a: string; items: string[] }>;
    loading: boolean;
    input: string;
    error: string | null;
  } | null>(null);

  // "Standing in the Brahmasthan" info modal — opened by tapping the
  // user-silhouette icon in the floor plan's center cell.
  const [centerInfoOpen, setCenterInfoOpen] = useState(false);

  const vastuAskLimit = 2;

  const openVastuAsk = (room: RoomAnalysis) => {
    const content = [
      room.roomLabel,
      `Direction: ${room.currentDirection}`,
      room.idealDirection ? `Ideal direction: ${room.idealDirection}` : '',
      `Score: ${room.score}%`,
      room.good ? `What's good: ${room.good}` : '',
      room.impact ? `Impact: ${room.impact}` : '',
      room.remedy ? `Remedy: ${room.remedy}` : '',
      ...(room.highlights ?? []),
    ].filter(Boolean).join('\n');
    setVastuAskModal({ roomLabel: room.roomLabel, roomContent: content, qas: [], loading: false, input: '', error: null });
  };

  const submitVastuQuestion = async () => {
    if (!vastuAskModal || !vastuAskModal.input.trim() || vastuAskModal.loading || vastuAskModal.qas.length >= vastuAskLimit) return;
    const question = vastuAskModal.input.trim();
    setVastuAskModal((m) => m ? { ...m, loading: true, error: null } : m);
    try {
      const res = await fetch('/api/vastu/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, roomLabel: vastuAskModal.roomLabel, roomContent: vastuAskModal.roomContent }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to get answer');
      const items = Array.isArray(json.data.items) ? json.data.items.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0) : [];
      setVastuAskModal((m) => m ? { ...m, qas: [...m.qas, { q: question, a: json.data.answer, items }], input: '', loading: false } : m);
    } catch (err) {
      setVastuAskModal((m) => m ? { ...m, loading: false, error: err instanceof Error ? err.message : 'Something went wrong' } : m);
    }
  };

  // Restore a fresh result from localStorage (set when analysis completed).
  // Handles the case where the user navigated away during the 2-5 min wait
  // and returns via the browser notification.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('vastu_last_result');
      if (!raw) return;
      const { result: r, ts } = JSON.parse(raw) as { result: VastuResult; ts: number };
      if (Date.now() - ts < 24 * 3600_000) setResult(r);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetch('/api/vastu/history')
      .then((r) => r.json())
      .then((d) => { if (d.success) setPreviousReports(d.data ?? []); })
      .catch(() => {})
      .finally(() => setReportsLoading(false));
  }, []);

  const placedRoomSet = new Set(placements.map((p) => p.roomId));
  function getRoomCount(id: string) { return placements.filter((p) => p.roomId === id).length; }
  function getRoomById(id: string) { return ROOM_TYPES.find((r) => r.id === id); }

  /* ---- Floor plan handlers ---- */
  function handleRoomChipClick(roomId: string) {
    setSelectedFurnitureItem(null);
    setSelectedRoom(selectedRoom === roomId ? null : roomId);
  }

  const handleDirectionClick = useCallback(
    (direction: Direction) => {
      if (!selectedRoom) return;
      const instanceId = `${selectedRoom}_${instanceCounter}`;
      setInstanceCounter((c) => c + 1);
      setPlacements((prev) => [...prev, { instanceId, roomId: selectedRoom, direction }]);
      const sq = SUB_QUESTIONS[selectedRoom];
      if (sq) setSubAnswers((prev) => [...prev, { instanceId, roomId: selectedRoom, question: sq.question, options: sq.options, answer: '' }]);
      setSelectedRoom(null);
    },
    [selectedRoom, instanceCounter],
  );

  function removePlacement(instanceId: string) {
    setPlacements((prev) => prev.filter((p) => p.instanceId !== instanceId));
    setSubAnswers((prev) => prev.filter((s) => s.instanceId !== instanceId));
    setFurniturePlacements((prev) => { const next = { ...prev }; delete next[instanceId]; return next; });
    if (expandedInterior === instanceId) setExpandedInterior(null);
  }

  function updateSubAnswer(instanceId: string, answer: string) {
    setSubAnswers((prev) => prev.map((s) => (s.instanceId === instanceId ? { ...s, answer } : s)));
  }

  function getRoomsInDirection(dir: Direction) { return placements.filter((p) => p.direction === dir); }

  /* ---- Interior furniture handlers ---- */
  function handleFurnitureChipClick(instanceId: string, furnitureId: string) {
    if (selectedFurnitureItem?.instanceId === instanceId && selectedFurnitureItem?.furnitureId === furnitureId) {
      setSelectedFurnitureItem(null);
    } else {
      setSelectedFurnitureItem({ instanceId, furnitureId });
    }
  }

  function handleFurniturePlace(instanceId: string, direction: Direction) {
    if (!selectedFurnitureItem || selectedFurnitureItem.instanceId !== instanceId) return;
    const { furnitureId } = selectedFurnitureItem;
    setFurniturePlacements((prev) => {
      const existing = prev[instanceId] ?? [];
      const filtered = existing.filter((f) => f.furnitureId !== furnitureId);
      return { ...prev, [instanceId]: [...filtered, { furnitureId, direction }] };
    });
    setSelectedFurnitureItem(null);
  }

  function handleFurnitureRemove(instanceId: string, furnitureId: string) {
    setFurniturePlacements((prev) => ({
      ...prev,
      [instanceId]: (prev[instanceId] ?? []).filter((f) => f.furnitureId !== furnitureId),
    }));
  }

  function getFurnitureInDirection(instanceId: string, dir: Direction) {
    return (furniturePlacements[instanceId] ?? []).filter((f) => f.direction === dir);
  }

  /* ---- Analyze ---- */
  async function handleAnalyze() {
    if (placements.length === 0) return;
    // Ask for notification permission before the long wait begins
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/vastu/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomLayout: placements.reduce((acc, p) => {
            if (!acc[p.roomId]) acc[p.roomId] = [];
            acc[p.roomId].push(p.direction);
            return acc;
          }, {} as Record<string, string[]>),
          roomDetails: {
            ...subAnswers.filter((s) => s.answer).reduce((acc, s) => {
              acc[`${s.roomId}_${s.instanceId}_${s.question}`] = s.answer;
              return acc;
            }, {} as Record<string, unknown>),
            ...Object.entries(furniturePlacements).reduce((acc, [iId, fps]) => {
              const roomId = placements.find((p) => p.instanceId === iId)?.roomId;
              if (roomId) fps.forEach((fp) => { acc[`${roomId}_interior_${fp.furnitureId}`] = fp.direction; });
              return acc;
            }, {} as Record<string, unknown>),
            ...(extraNotes.trim() ? { extra_notes: extraNotes.trim() } : {}),
          },
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to analyze');
      const data = await res.json();
      type VastuScore = { room: string; currentDirection: string; idealDirections: string[]; score: number; suggestion: string };
      type AIRoomEntry = { room: string; currentPlacement?: string; impact?: string; remedy?: string; good?: string; buyItems?: string[]; highlights?: string[] };
      const raw = data.data as {
        overallScore: number;
        analysis: { vastuScores?: VastuScore[]; generalRemedies?: string[]; remedies?: { immediate?: string[] }; roomAnalysis?: AIRoomEntry[]; notesAnswer?: string; notesAnswerItems?: string[] };
      };
      const aiRoomAnalyses = raw.analysis?.roomAnalysis ?? [];
      const vastuScores = raw.analysis?.vastuScores ?? [];
      const rooms: RoomAnalysis[] = vastuScores.map((rs, idx) => {
        const normalise = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
        const aiRoom =
          aiRoomAnalyses.find(
            (a) => normalise(a.room) === normalise(rs.room) && (!a.currentPlacement || a.currentPlacement.toUpperCase() === rs.currentDirection.toUpperCase()),
          ) ?? aiRoomAnalyses.find((a) => normalise(a.room) === normalise(rs.room));
        const sameRoomTotal = vastuScores.filter((s) => s.room === rs.room).length;
        const roomBase = ROOM_TYPES.find((r) => r.id === rs.room)?.label ?? rs.room;
        return {
          instanceKey: `${rs.room}_${rs.currentDirection}_${idx}`,
          roomId: rs.room,
          roomLabel: sameRoomTotal > 1 ? `${roomBase} (${rs.currentDirection})` : roomBase,
          currentDirection: rs.currentDirection,
          idealDirection: rs.idealDirections?.[0] ?? '',
          score: rs.score,
          isCorrect: rs.score >= 80,
          suggestion: rs.suggestion ?? '',
          remedy: aiRoom?.remedy,
          impact: aiRoom?.impact,
          good: aiRoom?.good,
          buyItems: aiRoom?.buyItems ?? [],
          highlights: aiRoom?.highlights ?? [],
        };
      });
      const resultObj: VastuResult = {
        rooms,
        overallScore: raw.overallScore,
        generalRemedies: raw.analysis?.generalRemedies ?? raw.analysis?.remedies?.immediate ?? [],
        notesAnswer: raw.analysis?.notesAnswer,
        notesAnswerItems: raw.analysis?.notesAnswerItems ?? [],
        notesQuestion: extraNotes.trim() || undefined,
      };
      setResult(resultObj);

      // Persist so the page can restore it if the user navigated away
      try { localStorage.setItem('vastu_last_result', JSON.stringify({ result: resultObj, ts: Date.now() })); } catch { /* ignore */ }

      // Browser notification — fires even if the user switched tabs
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        const scoreLabel = resultObj.overallScore >= 75 ? 'Great Vastu!' : resultObj.overallScore >= 50 ? 'Some improvements needed.' : 'Major issues found.';
        const notif = new Notification('🏠 Vastu Analysis Ready', {
          body: `${placements.length}-room report scored ${resultObj.overallScore}% — ${scoreLabel} Tap to view.`,
          tag: 'vastu-result',
        });
        notif.onclick = () => { window.focus(); notif.close(); };
      }
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Something went wrong'); }
    finally { setLoading(false); }
  }

  const selectedRoomData = selectedRoom ? getRoomById(selectedRoom) : null;
  const interiorRooms = placements.filter((p) => ROOM_FURNITURE[p.roomId]);

  if (loading) {
    return (
      <MotionPage className="mx-auto max-w-6xl px-4 py-6 min-h-screen flex flex-col items-center justify-center gap-4">
        <Loading size="lg" section="vastu" />
        <div className="text-center max-w-xs space-y-1.5">
          <p className="text-sm font-semibold text-text">Analyzing your Vastu…</p>
          <p className="text-xs text-text-secondary leading-relaxed">
            We're processing a large amount of data — each room, furniture placement, elemental balance, and your notes. This takes <span className="font-semibold text-text">2–5 minutes</span>. Please don't close this page.
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            {['Rooms', 'Elements', 'Remedies', 'Report'].map((step, i) => (
              <div key={step} className="flex items-center gap-1.5">
                <span
                  className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--primary)', border: '1px solid rgba(212,175,55,0.25)' }}
                >
                  {step}
                </span>
                {i < 3 && <span className="text-[8px] text-text-secondary/40">›</span>}
              </div>
            ))}
          </div>
        </div>
      </MotionPage>
    );
  }

  return (
    <MotionPage className="mx-auto max-w-6xl px-4 py-6 min-h-screen">
      {/* Header */}
      <div className="mb-5">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Sacred Architecture</p>
        <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">
          Vastu Shastra Analysis
        </h1>
        <p className="mt-0.5 text-sm text-text-secondary">
          Design your floor plan and get AI-powered Vastu recommendations
        </p>
      </div>

      {/* Previous Reports */}
      {(reportsLoading || previousReports.length > 0) && (
        <FadeIn>
          <div className="mb-4 rounded-xl border border-border/40 bg-surface overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/30">
              <span className="text-sm">🏛️</span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/60">Previous Reports</p>
                <p className="text-[11px] text-text-secondary">Your saved Vastu analyses</p>
              </div>
            </div>
            {reportsLoading ? (
              <div className="px-3 py-4 text-center text-[11px] text-text-secondary/50">Loading reports...</div>
            ) : (
              <div className="divide-y divide-border/20">
                {previousReports.map((report) => {
                  const analysis = report.analysis as Record<string, unknown>;
                  const score = (analysis?.overallVastuScore ?? analysis?.overallScore) as number | undefined;
                  const roomCount = Object.keys(report.room_layout ?? {}).length;
                  const isExpanded = expandedReport === report.id;
                  const date = new Date(report.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                  const summary = analysis?.summary as string[] | undefined;
                  const priorityActions = analysis?.priorityActions as string[] | undefined;
                  const vastuScores = analysis?.vastuScores as Array<{ room: string; currentDirection: string; score: number }> | undefined;

                  return (
                    <div key={report.id}>
                      <button
                        type="button"
                        onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-bg/50 transition-colors text-left"
                      >
                        <div
                          className="flex h-10 w-10 flex-shrink-0 flex-col items-center justify-center rounded-full text-xs font-bold"
                          style={{
                            backgroundColor: score != null ? (score >= 75 ? '#22c55e15' : score >= 50 ? 'rgba(212, 175, 55,0.15)' : '#ef444415') : 'var(--bg)',
                            color: score != null ? (score >= 75 ? '#22c55e' : score >= 50 ? 'var(--primary)' : '#ef4444') : 'var(--text-muted)',
                            border: `2px solid ${score != null ? (score >= 75 ? '#22c55e30' : score >= 50 ? 'rgba(212, 175, 55,0.3)' : '#ef444430') : 'var(--border)'}`,
                          }}
                        >
                          <span className="text-[13px] font-bold leading-none">{score != null ? score : '—'}</span>
                          {score != null && <span className="text-[7px] leading-none opacity-70">%</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-text">{date}</p>
                          <p className="text-[10px] text-text-secondary">{roomCount} room{roomCount !== 1 ? 's' : ''} analysed</p>
                        </div>
                        <span className="text-[9px] text-text-secondary/40 font-mono">{isExpanded ? '▲' : '▼'}</span>
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22 }}
                            className="overflow-hidden"
                          >
                            <div className="px-3 pb-3 pt-1.5 space-y-2.5 border-t border-border/20">
                              {/* Summary HNA */}
                              {Array.isArray(summary) && summary.length > 0 && (
                                <div className="rounded-lg bg-bg/60 p-2.5 space-y-0.5">
                                  {summary.map((s, i) => (
                                    <p key={i} className={`text-[11px] ${i === 0 ? 'font-medium text-text' : 'text-text-secondary'}`}>{s}</p>
                                  ))}
                                </div>
                              )}
                              {/* Room scores grid */}
                              {vastuScores && vastuScores.length > 0 && (
                                <div className="grid grid-cols-2 gap-1.5">
                                  {vastuScores.map((rs, i) => {
                                    const roomType = ROOM_TYPES.find((r) => r.id === rs.room);
                                    return (
                                      <div
                                        key={i}
                                        className="flex items-center gap-1.5 rounded-lg p-1.5"
                                        style={{
                                          backgroundColor: rs.score >= 80 ? '#22c55e06' : '#ef444406',
                                          border: `1px solid ${rs.score >= 80 ? '#22c55e20' : '#ef444420'}`,
                                        }}
                                      >
                                        <span className="text-xs">{roomType?.emoji ?? '🏠'}</span>
                                        <span className="text-[10px] text-text flex-1 truncate">{roomType?.label ?? rs.room}</span>
                                        <span
                                          className="text-[10px] font-bold"
                                          style={{ color: rs.score >= 80 ? '#22c55e' : rs.score >= 50 ? '#f59e0b' : '#ef4444' }}
                                        >
                                          {rs.score}%
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {/* Priority actions */}
                              {Array.isArray(priorityActions) && priorityActions.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-warning mb-1">Priority Actions</p>
                                  <ul className="space-y-0.5">
                                    {priorityActions.slice(0, 4).map((a, i) => (
                                      <li key={i} className="flex items-start gap-1 text-[10px] text-text-secondary">
                                        <span className="text-warning mt-px flex-shrink-0">▸</span> {a}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </FadeIn>
      )}

      {!result && (
      <>
      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        {/* Left: Floor Plan */}
        <div>
          {/* Room Palette */}
          <FadeIn>
            <div className="mb-3 rounded-xl border border-border/50 bg-surface p-3 backdrop-blur-[10px]">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary/60">
                {selectedRoom
                  ? `Place ${selectedRoomData?.emoji} ${selectedRoomData?.label} on the grid — tap the chip again to add another`
                  : 'Select a room — tap a chip multiple times to place more than one'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ROOM_TYPES.map((room) => {
                  const count = getRoomCount(room.id);
                  const isSelected = selectedRoom === room.id;
                  return (
                    <motion.button
                      key={room.id}
                      type="button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleRoomChipClick(room.id)}
                      className="flex items-center gap-1 rounded-lg border-2 px-2.5 py-1.5 text-[11px] font-medium transition-all"
                      style={{
                        borderColor: isSelected ? room.color : count > 0 ? `${room.color}60` : 'var(--border)',
                        backgroundColor: isSelected ? `${room.color}20` : count > 0 ? `${room.color}08` : undefined,
                        boxShadow: isSelected ? `0 0 16px ${room.color}30` : undefined,
                      }}
                    >
                      <span className="text-sm">{room.emoji}</span>
                      <span>{room.label}</span>
                      {count > 1 && (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold" style={{ backgroundColor: room.color, color: '#fff' }}>
                          {count}
                        </span>
                      )}
                      {count === 1 && <span style={{ color: '#22c55e', fontSize: '10px' }}>&#10003;</span>}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </FadeIn>

          {/* Floor Plan Grid — blueprint-style */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="relative overflow-hidden rounded-xl font-mono"
            style={{
              backgroundColor: 'var(--bg)',
              backgroundImage: 'linear-gradient(rgba(212, 175, 55,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(212, 175, 55,0.06) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div className="flex items-center justify-between border-b px-3 py-1.5" style={{ borderColor: 'rgba(212, 175, 55,0.35)' }}>
              <span className="text-[10px] font-bold tracking-[3px] uppercase" style={{ color: 'var(--text)' }}>Floor Plan</span>
              <span className="text-[8px] tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>Scale 1:100 | Vastu Grid</span>
            </div>

            <div className="relative px-5 pb-3 pt-1.5">
              <div className="mb-0.5 text-center">
                <span className="text-[9px] font-bold tracking-[6px]" style={{ color: '#ef4444' }}>N O R T H</span>
              </div>
              <div className="flex items-stretch">
                <div className="flex items-center justify-center pr-1.5" style={{ writingMode: 'vertical-lr' }}>
                  <span className="text-[9px] font-bold tracking-[6px] rotate-180" style={{ color: 'var(--text)' }}>W E S T</span>
                </div>

                <div className="mx-auto grid flex-1 max-w-[480px] grid-cols-3" style={{ border: '2px solid rgba(212, 175, 55,0.35)' }}>
                  {DIRECTIONS.map((dir) => {
                    const roomsHere = getRoomsInDirection(dir);
                    const meta = DIRECTION_META[dir];
                    const isClickable = !!selectedRoom;
                    const hasRooms = roomsHere.length > 0;
                    return (
                      <motion.div
                        key={dir}
                        role="button"
                        tabIndex={isClickable ? 0 : -1}
                        onClick={() => isClickable && handleDirectionClick(dir)}
                        onKeyDown={(e) => e.key === 'Enter' && isClickable && handleDirectionClick(dir)}
                        whileHover={isClickable ? { backgroundColor: 'rgba(212, 175, 55,0.14)' } : undefined}
                        className={`relative flex min-h-[130px] flex-col items-center justify-start p-2.5 transition-all duration-200 ${isClickable ? 'cursor-pointer' : ''}`}
                        style={{
                          border: '2px solid rgba(212, 175, 55,0.35)',
                          background: isClickable ? 'rgba(212, 175, 55,0.08)' : hasRooms ? 'rgba(212, 175, 55,0.04)' : 'transparent',
                        }}
                      >
                        <span className="absolute top-0 left-0 h-1.5 w-1.5" style={{ borderTop: '1px solid var(--border)', borderLeft: '1px solid var(--border)' }} />
                        <span className="absolute top-0 right-0 h-1.5 w-1.5" style={{ borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} />
                        <span className="absolute bottom-0 left-0 h-1.5 w-1.5" style={{ borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)' }} />
                        <span className="absolute bottom-0 right-0 h-1.5 w-1.5" style={{ borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} />

                        <div className="flex w-full items-center justify-between mb-0.5">
                          <span className="text-[9px] font-bold tracking-wider px-1 py-px" style={{ color: 'var(--text)', border: '1px solid rgba(212, 175, 55,0.35)', backgroundColor: 'var(--surface)' }}>
                            {dir}
                          </span>
                          <span className="text-[7px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{meta.element}</span>
                        </div>

                        {/* Brahmasthan user-standing marker — only in the Center cell.
                            Tapping opens an info modal explaining what "standing in
                            the centre" means in Vastu. Stops propagation so it never
                            triggers a room placement on the cell. */}
                        {dir === 'Center' && (
                          <button
                            type="button"
                            aria-label="What does standing in the centre mean?"
                            onClick={(e) => { e.stopPropagation(); setCenterInfoOpen(true); }}
                            className="mx-auto mt-1 flex flex-col items-center gap-0.5 cursor-pointer transition-transform hover:scale-110 active:scale-95"
                          >
                            <span
                              className="flex h-9 w-9 items-center justify-center rounded-full text-lg shadow-sm"
                              style={{
                                background: 'radial-gradient(circle at 30% 30%, rgba(212, 175, 55,0.35), rgba(212, 175, 55,0.10))',
                                border: '1.5px solid rgba(212, 175, 55,0.55)',
                                color: '#7C3AED',
                              }}
                            >
                              🧘
                            </span>
                            <span className="text-[7px] font-bold uppercase tracking-wider" style={{ color: 'var(--primary)' }}>
                              You · tap
                            </span>
                          </button>
                        )}

                        {hasRooms && (
                          <div className="flex flex-col gap-1 w-full mt-0.5">
                            {roomsHere.map((p) => {
                              const room = getRoomById(p.roomId);
                              if (!room) return null;
                              return (
                                <div key={p.instanceId} className="group w-full">
                                  <div className="flex items-center gap-1 px-1.5 py-1" style={{ border: `1px solid ${room.color}50`, backgroundColor: `${room.color}0a` }}>
                                    <span className="flex h-4 w-4 items-center justify-center text-[9px]" style={{ border: '1px solid rgba(212, 175, 55,0.35)', backgroundColor: 'var(--bg)' }}>
                                      {room.emoji}
                                    </span>
                                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: room.color }}>{room.label}</span>
                                    <span
                                      role="button" tabIndex={0}
                                      aria-label={`Remove ${room.label}`}
                                      onClick={(e) => { e.stopPropagation(); removePlacement(p.instanceId); }}
                                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); removePlacement(p.instanceId); } }}
                                      className="ml-auto flex h-5 w-5 items-center justify-center cursor-pointer text-[10px] opacity-70 group-hover:opacity-100 transition-opacity"
                                      style={{ color: '#ef4444', border: '1px solid #ef444466', backgroundColor: '#ef444415' }}
                                    >&#10005;</span>
                                  </div>
                                  <div className="flex items-center gap-0.5 mt-px px-0.5">
                                    <div className="flex-1 border-t border-dashed" style={{ borderColor: 'var(--border)' }} />
                                    <span className="text-[6px]" style={{ color: 'var(--text-muted)' }}>3.5m</span>
                                    <div className="flex-1 border-t border-dashed" style={{ borderColor: 'var(--border)' }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {hasRooms && isClickable && (
                          <div className="mt-1 w-full">
                            <div className="animate-pulse border border-dashed px-1.5 py-0.5 text-[7px] uppercase tracking-wider text-center" style={{ borderColor: '#4ade8060', color: '#4ade80' }}>
                              + Add here
                            </div>
                          </div>
                        )}
                        {!hasRooms && !isClickable && (
                          <div className="mt-auto mb-0.5">
                            <span className="text-[7px] uppercase tracking-wider" style={{ color: 'rgba(212, 175, 55,0.35)' }}>Empty</span>
                          </div>
                        )}
                        {!hasRooms && isClickable && (
                          <div className="mt-auto mb-0.5">
                            <div className="animate-pulse border border-dashed px-1.5 py-0.5 text-[7px] uppercase tracking-wider" style={{ borderColor: '#4ade8060', color: '#4ade80' }}>
                              + Tap to place
                            </div>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-center pl-1.5" style={{ writingMode: 'vertical-lr' }}>
                  <span className="text-[9px] font-bold tracking-[6px]" style={{ color: 'var(--text)' }}>E A S T</span>
                </div>
              </div>
              <div className="mt-0.5 text-center">
                <span className="text-[9px] font-bold tracking-[6px]" style={{ color: 'var(--text)' }}>S O U T H</span>
              </div>
            </div>

            <div className="flex justify-center gap-4 border-t px-3 py-1.5" style={{ borderColor: 'rgba(212, 175, 55,0.35)' }}>
              {['Water', 'Fire', 'Earth', 'Air', 'Space'].map((el) => {
                const colors: Record<string, string> = { Water: '#3b82f6', Fire: '#ef4444', Earth: '#8b5cf6', Air: '#64748b', Space: '#c9a227' };
                return (
                  <div key={el} className="flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors[el] }} />
                    <span className="text-[8px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{el}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-3">
          <FadeIn delay={0.1}>
            <div className="rounded-xl border border-border/30 bg-surface p-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-lg bg-bg p-2.5 text-center">
                  <p className="text-xl font-bold text-primary">{placements.length}</p>
                  <p className="text-[9px] text-text-secondary">Rooms Placed</p>
                </div>
                <div className="rounded-lg bg-bg p-2.5 text-center">
                  <p className="text-xl font-bold text-text-secondary">{ROOM_TYPES.length - placedRoomSet.size}</p>
                  <p className="text-[9px] text-text-secondary">Types Remaining</p>
                </div>
              </div>
            </div>
          </FadeIn>

          {/* Sub-Questions */}
          <AnimatePresence>
            {subAnswers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-xl border border-border/30 bg-surface p-3"
              >
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary/60">Room Details</p>
                <div className="space-y-2.5">
                  {subAnswers.map((sq) => {
                    const room = getRoomById(sq.roomId);
                    return (
                      <div key={sq.instanceId}>
                        <label className="mb-0.5 block text-[11px] font-medium text-text">
                          {room?.emoji} {room?.label}: {sq.question}
                        </label>
                        <Select
                          value={sq.answer}
                          onChange={(e) => updateSubAnswer(sq.instanceId, e.target.value)}
                          options={sq.options.map((o) => ({ value: o, label: o }))}
                          placeholder="Select..."
                        />
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Vastu Tips */}
          <FadeIn delay={0.2}>
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-3">
              <p className="mb-1.5 text-[11px] font-semibold text-accent">Quick Vastu Tips</p>
              <ul className="space-y-1 text-[10px] text-text-secondary">
                <li>NE is the most sacred direction (Water+Air)</li>
                <li>Kitchen should be in SE (Fire element)</li>
                <li>Master bedroom ideally in SW (Earth)</li>
                <li>Entrance facing N/NE/E is auspicious</li>
                <li>Keep Center (Brahmasthan) open</li>
                <li>Puja room best in NE corner</li>
              </ul>
            </div>
          </FadeIn>

        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Room Interiors — furniture placement for supported rooms            */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {interiorRooms.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-5 space-y-3"
          >
            <div className="flex items-center gap-2">
              <h2 className="font-[family-name:var(--font-serif)] text-base font-semibold text-text">Room Interiors</h2>
              <span className="text-[10px] text-text-secondary">optional · helps us give more accurate furniture advice</span>
            </div>

            {interiorRooms.map((placement) => {
              const room = getRoomById(placement.roomId);
              if (!room) return null;
              const furnitureList = ROOM_FURNITURE[placement.roomId];
              const isExpanded = expandedInterior === placement.instanceId;
              const placedFurniture = furniturePlacements[placement.instanceId] ?? [];

              return (
                <div key={placement.instanceId} className="rounded-xl border border-border/40 bg-surface overflow-hidden">
                  {/* Card header */}
                  <button
                    type="button"
                    onClick={() => setExpandedInterior(isExpanded ? null : placement.instanceId)}
                    className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-bg/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{room.emoji}</span>
                      <div className="text-left">
                        <p className="text-[12px] font-semibold text-text">{room.label}</p>
                        <p className="text-[9px] text-text-secondary">{placement.direction} · {placedFurniture.length} item{placedFurniture.length !== 1 ? 's' : ''} placed</p>
                      </div>
                    </div>
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold transition-all"
                      style={{
                        borderColor: isExpanded ? room.color : 'var(--border)',
                        color: isExpanded ? room.color : 'var(--text-secondary)',
                        backgroundColor: isExpanded ? `${room.color}15` : undefined,
                      }}
                    >
                      {isExpanded ? '−' : '+'}
                    </div>
                  </button>

                  {/* Expanded interior */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t px-3 pb-3 pt-2.5" style={{ borderColor: 'rgba(212, 175, 55,0.2)' }}>
                          {/* Furniture chips */}
                          <p className="mb-2 text-[10px] text-text-secondary/70">
                            {selectedFurnitureItem?.instanceId === placement.instanceId
                              ? `Place ${furnitureList.find(f => f.id === selectedFurnitureItem.furnitureId)?.emoji} ${furnitureList.find(f => f.id === selectedFurnitureItem.furnitureId)?.label} on the grid`
                              : 'Select a furniture item, then tap a direction to place it'}
                          </p>
                          <div className="mb-3 flex flex-wrap gap-1.5">
                            {furnitureList.map((f) => {
                              const isPlaced = placedFurniture.some((fp) => fp.furnitureId === f.id);
                              const isSelected = selectedFurnitureItem?.instanceId === placement.instanceId && selectedFurnitureItem?.furnitureId === f.id;
                              return (
                                <motion.button
                                  key={f.id}
                                  type="button"
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.97 }}
                                  onClick={() => handleFurnitureChipClick(placement.instanceId, f.id)}
                                  className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition-all"
                                  style={{
                                    borderColor: isSelected ? room.color : isPlaced ? `${room.color}50` : 'var(--border)',
                                    backgroundColor: isSelected ? `${room.color}20` : isPlaced ? `${room.color}08` : undefined,
                                  }}
                                >
                                  <span>{f.emoji}</span>
                                  <span>{f.label}</span>
                                  {isPlaced && !isSelected && <span style={{ color: '#22c55e', fontSize: '9px' }}>&#10003;</span>}
                                </motion.button>
                              );
                            })}
                          </div>

                          {/* Blueprint-style direction grid — mirrors the main floor plan */}
                          <div
                            className="relative overflow-hidden rounded-lg font-mono"
                            style={{
                              backgroundColor: 'var(--bg)',
                              backgroundImage: 'linear-gradient(rgba(212, 175, 55,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(212, 175, 55,0.06) 1px, transparent 1px)',
                              backgroundSize: '12px 12px',
                              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                            }}
                          >
                            <div className="py-0.5 text-center">
                              <span className="text-[7px] font-bold tracking-[4px]" style={{ color: '#ef4444' }}>N O R T H</span>
                            </div>
                            <div className="flex items-stretch px-2 pb-1">
                              <div className="flex items-center justify-center pr-1" style={{ writingMode: 'vertical-lr' }}>
                                <span className="text-[7px] font-bold tracking-[3px] rotate-180" style={{ color: 'var(--text)' }}>W E S T</span>
                              </div>
                              <div className="flex-1 grid grid-cols-3" style={{ border: '1.5px solid rgba(212, 175, 55,0.35)' }}>
                                {DIRECTIONS.map((dir) => {
                                  const furnitureHere = getFurnitureInDirection(placement.instanceId, dir);
                                  const canPlace = !!selectedFurnitureItem && selectedFurnitureItem.instanceId === placement.instanceId;
                                  const meta = DIRECTION_META[dir];
                                  return (
                                    <div
                                      key={dir}
                                      role={canPlace ? 'button' : undefined}
                                      tabIndex={canPlace ? 0 : -1}
                                      onClick={() => canPlace && handleFurniturePlace(placement.instanceId, dir)}
                                      onKeyDown={(e) => e.key === 'Enter' && canPlace && handleFurniturePlace(placement.instanceId, dir)}
                                      className={`relative min-h-[70px] flex flex-col p-1.5 transition-all ${canPlace ? 'cursor-pointer hover:bg-primary/5' : ''}`}
                                      style={{
                                        border: '1px solid rgba(212, 175, 55,0.25)',
                                        backgroundColor: furnitureHere.length > 0 ? `${room.color}06` : canPlace ? 'rgba(212, 175, 55,0.05)' : undefined,
                                      }}
                                    >
                                      {/* Corner brackets */}
                                      <span className="absolute top-0 left-0 h-1.5 w-1.5" style={{ borderTop: '1px solid var(--border)', borderLeft: '1px solid var(--border)' }} />
                                      <span className="absolute top-0 right-0 h-1.5 w-1.5" style={{ borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} />
                                      <span className="absolute bottom-0 left-0 h-1.5 w-1.5" style={{ borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)' }} />
                                      <span className="absolute bottom-0 right-0 h-1.5 w-1.5" style={{ borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} />

                                      <div className="flex w-full items-center justify-between mb-1">
                                        <span
                                          className="text-[7px] font-bold px-0.5 py-px"
                                          style={{ color: meta.color, border: '1px solid rgba(212, 175, 55,0.3)', backgroundColor: 'var(--surface)' }}
                                        >
                                          {dir}
                                        </span>
                                        <span className="text-[6px]" style={{ color: 'var(--text-muted)' }}>{meta.element.split('+')[0]}</span>
                                      </div>

                                      <div className="space-y-0.5 flex-1">
                                        {furnitureHere.map((fp) => {
                                          const fi = furnitureList.find((f) => f.id === fp.furnitureId);
                                          return (
                                            <div
                                              key={fp.furnitureId}
                                              className="flex items-center gap-0.5 px-0.5 py-px"
                                              style={{ backgroundColor: `${room.color}15`, border: `1px solid ${room.color}30` }}
                                            >
                                              <span className="text-[8px]">{fi?.emoji}</span>
                                              <span className="text-[7px] text-text-secondary flex-1 truncate">{fi?.label}</span>
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleFurnitureRemove(placement.instanceId, fp.furnitureId); }}
                                                className="text-[7px] text-error/60 hover:text-error leading-none"
                                              >✕</button>
                                            </div>
                                          );
                                        })}
                                      </div>

                                      {canPlace && furnitureHere.length === 0 && (
                                        <div className="animate-pulse mt-auto">
                                          <span className="text-[6px] border border-dashed px-0.5 py-px" style={{ borderColor: '#4ade8060', color: '#4ade80' }}>+ tap</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="flex items-center justify-center pl-1" style={{ writingMode: 'vertical-lr' }}>
                                <span className="text-[7px] font-bold tracking-[3px]" style={{ color: 'var(--text)' }}>E A S T</span>
                              </div>
                            </div>
                            <div className="py-0.5 text-center">
                              <span className="text-[7px] font-bold tracking-[4px]" style={{ color: 'var(--text)' }}>S O U T H</span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------------ */}
      {/* Extra Notes                                                         */}
      {/* ------------------------------------------------------------------ */}
      <FadeIn delay={0.3}>
        <div className="mt-4 rounded-xl border border-border/40 bg-surface p-3">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-secondary/60">
            Additional Details (optional)
          </label>
          <textarea
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            placeholder="Share anything else — house age, facing direction of the building, recent health or financial concerns, or any specific rooms troubling you..."
            rows={3}
            className="w-full resize-none rounded-lg border bg-bg px-3 py-2 text-[12px] text-text placeholder:text-text-secondary/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
            style={{ borderColor: 'var(--border)' }}
          />
        </div>
      </FadeIn>

      {/* Analyze button — placed last so users complete all optional sections first */}
      <FadeIn delay={0.35}>
        <div className="mt-5 space-y-2">
          <div
            className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
            style={{ background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.22)' }}
          >
            <span className="text-base mt-0.5 flex-shrink-0">⏳</span>
            <div>
              <p className="text-[11px] font-semibold text-text">Deep analysis in progress</p>
              <p className="text-[10px] text-text-secondary leading-snug mt-0.5">
                We examine every room, elemental balance, furniture placement, and your personal notes — this takes <span className="font-semibold text-text">2–5 minutes</span>.
              </p>
            </div>
          </div>
          <Button size="lg" onClick={handleAnalyze} disabled={placements.length === 0} className="w-full">
            {placements.length === 0 ? 'Add rooms to analyze' : `Analyze Vastu (${placements.length} room${placements.length !== 1 ? 's' : ''})`}
          </Button>
          {error && <p className="text-center text-xs text-error">{error}</p>}
        </div>
      </FadeIn>
      </>
      )}

      {/* Results */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-4"
        >
          {/* Edit again / Reset toolbar — shown above the report so the user
              can either go back to the editor (placements preserved) or wipe
              everything and start fresh. */}
          <div
            className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 mb-2"
            style={{ background: 'rgba(212, 175, 55,0.06)', border: '1px solid rgba(212, 175, 55,0.22)' }}
          >
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-text leading-tight">Your Vastu report is ready</p>
              <p className="text-[10px] text-text-secondary mt-0.5">Tweak the floor plan or start over anytime.</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => { try { localStorage.removeItem('vastu_last_result'); } catch { /* ignore */ } setResult(null); setError(''); }}
                className="px-3 py-2 rounded-lg text-[12px] font-semibold cursor-pointer bg-surface border border-border text-text hover:bg-surface-2 transition-colors"
              >
                ✎ Edit again
              </button>
              <button
                type="button"
                onClick={() => {
                  try { localStorage.removeItem('vastu_last_result'); } catch { /* ignore */ }
                  setResult(null);
                  setPlacements([]);
                  setFurniturePlacements({});
                  setSelectedRoom(null);
                  setExtraNotes('');
                  setSubAnswers([]);
                  setError('');
                }}
                className="px-3 py-2 rounded-lg text-[12px] font-semibold cursor-pointer transition-colors"
                style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#dc2626' }}
              >
                ⟲ Reset
              </button>
            </div>
          </div>
          {/* Overall Score */}
          <div className="flex justify-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative flex h-44 w-44 items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(${result.overallScore >= 75 ? '#22c55e' : result.overallScore >= 50 ? 'var(--primary)' : '#ef4444'} ${result.overallScore * 3.6}deg, rgba(0,0,0,0.08) 0deg)`,
                boxShadow: `0 0 40px ${result.overallScore >= 75 ? '#22c55e20' : result.overallScore >= 50 ? 'rgba(212, 175, 55,0.15)' : '#ef444420'}`,
              }}
            >
              <div className="flex h-36 w-36 flex-col items-center justify-center rounded-full bg-bg">
                <span className="text-3xl font-bold text-text">{result.overallScore}%</span>
                <span className="text-[11px] text-text-secondary">Vastu Score</span>
                <Badge variant={result.overallScore >= 75 ? 'success' : result.overallScore >= 50 ? 'warning' : 'error'} className="mt-0.5">
                  {result.overallScore >= 75 ? 'Good Vastu' : result.overallScore >= 50 ? 'Needs Work' : 'Major Issues'}
                </Badge>
              </div>
            </motion.div>
          </div>

          {/* Notes Answer — richer card matching room card styling */}
          {result.notesAnswer && (
            <ScrollReveal>
              <div
                className="rounded-xl border-2 p-3 space-y-2.5"
                style={{
                  borderColor: 'rgba(212, 175, 55,0.4)',
                  background: 'linear-gradient(135deg, rgba(212, 175, 55,0.05), transparent)',
                }}
              >
                {/* Header */}
                <div className="flex items-center gap-2">
                  <span className="text-lg">💬</span>
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text)' }}>Your Question — Answered</p>
                    {result.notesQuestion && (
                      <p className="text-[11px] text-text-secondary italic line-clamp-2">&ldquo;{result.notesQuestion}&rdquo;</p>
                    )}
                  </div>
                </div>

                {/* Answer */}
                <div className="rounded-lg p-2.5" style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <p className="text-[12px] text-text leading-relaxed whitespace-pre-line">{result.notesAnswer}</p>
                </div>

                {/* Buy items mentioned in answer */}
                {result.notesAnswerItems && result.notesAnswerItems.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text)' }}>
                      Shop for items mentioned
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.notesAnswerItems.map((item, idx) => (
                        <a
                          key={idx}
                          href={`https://www.google.com/search?q=${encodeURIComponent(item + ' buy online india vastu')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition-all hover:shadow-sm active:scale-95"
                          style={{
                            borderColor: 'rgba(212, 175, 55,0.35)',
                            backgroundColor: 'var(--bg)',
                            color: 'var(--text)',
                          }}
                        >
                          <span className="text-[11px]">🛒</span>
                          <span>{item}</span>
                          <span className="text-[8px] opacity-50">↗</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollReveal>
          )}

          {/* Room-by-Room */}
          <StaggerList className="grid gap-3 md:grid-cols-2">
            {result.rooms.map((room) => {
              const roomType = getRoomById(room.roomId);
              const scoreColor = room.score >= 80 ? '#22c55e' : room.score >= 50 ? '#f59e0b' : '#ef4444';
              const buyItems = room.buyItems ?? [];
              const highlights = room.highlights ?? [];
              return (
                <StaggerItem key={room.instanceKey}>
                  <div
                    className="rounded-xl border-2 p-3 transition-all hover:shadow-lg space-y-2"
                    style={{
                      borderColor: room.isCorrect ? '#22c55e30' : '#ef444430',
                      background: room.isCorrect
                        ? 'linear-gradient(135deg, rgba(34,197,94,0.04), transparent)'
                        : 'linear-gradient(135deg, rgba(239,68,68,0.04), transparent)',
                    }}
                  >
                    {/* Header: name + score % */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg">{roomType?.emoji}</span>
                        <div>
                          <p className="text-sm font-semibold text-text">{room.roomLabel}</p>
                          <p className="text-[9px] text-text-secondary">
                            Placed: {room.currentDirection}
                            {room.idealDirection && room.idealDirection !== room.currentDirection && (
                              <> · Best: <span style={{ color: '#22c55e' }}>{room.idealDirection}</span></>
                            )}
                          </p>
                        </div>
                      </div>
                      <div
                        className="flex h-11 w-11 flex-col items-center justify-center rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: `${scoreColor}15`,
                          color: scoreColor,
                          border: `2px solid ${scoreColor}40`,
                        }}
                      >
                        <span className="text-sm font-bold leading-none">{room.score}</span>
                        <span className="text-[7px] leading-none opacity-70">%</span>
                      </div>
                    </div>

                    {/* Highlights — 3 key bullet points */}
                    {highlights.length > 0 && (
                      <div className="rounded-lg p-2.5 space-y-1" style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)' }}>
                        {highlights.map((h, i) => (
                          <p key={i} className="flex items-start gap-1.5 text-[11px] text-text-secondary leading-snug">
                            <span className="mt-0.5 flex-shrink-0" style={{ color: scoreColor }}>›</span>
                            {h}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* GOOD — what's working */}
                    {room.good && (
                      <div className="flex items-start gap-1.5 rounded-lg p-2" style={{ backgroundColor: '#22c55e08', border: '1px solid #22c55e25' }}>
                        <span className="mt-0.5 text-[10px] text-green-500 flex-shrink-0">✓</span>
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#22c55e' }}>What&apos;s Good</p>
                          <p className="text-[11px] text-text-secondary">{room.good}</p>
                        </div>
                      </div>
                    )}

                    {/* PROBLEMS — human impact (shown for all rooms) */}
                    {room.impact && (
                      <div
                        className="flex items-start gap-1.5 rounded-lg p-2"
                        style={{
                          backgroundColor: room.isCorrect ? 'rgba(59,130,246,0.05)' : '#ef444408',
                          border: `1px solid ${room.isCorrect ? 'rgba(59,130,246,0.2)' : '#ef444425'}`,
                        }}
                      >
                        <span className="mt-0.5 text-[10px] flex-shrink-0" style={{ color: room.isCorrect ? '#3b82f6' : '#ef4444' }}>
                          {room.isCorrect ? 'ℹ' : '⚠'}
                        </span>
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: room.isCorrect ? '#3b82f6' : '#ef4444' }}>
                            {room.isCorrect ? 'Life Impact' : 'Issues'}
                          </p>
                          <p className="text-[11px] text-text-secondary">{room.impact}</p>
                        </div>
                      </div>
                    )}

                    {/* REMEDY */}
                    {room.remedy && (
                      <div className="rounded-lg border p-2" style={{ borderColor: '#f59e0b30', backgroundColor: 'rgba(245,158,11,0.05)' }}>
                        <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-warning">Remedy</p>
                        <p className="text-[11px] text-text-secondary">{room.remedy}</p>
                      </div>
                    )}

                    {/* BUY ITEMS — each chip navigates to Google Shopping */}
                    {buyItems.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text)' }}>
                          Shop for remedy items
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {buyItems.map((item, idx) => (
                            <a
                              key={idx}
                              href={`https://www.google.com/search?q=${encodeURIComponent(item + ' buy online india vastu')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition-all hover:shadow-sm active:scale-95"
                              style={{
                                borderColor: 'rgba(212, 175, 55,0.35)',
                                backgroundColor: 'var(--bg)',
                                color: 'var(--text)',
                              }}
                            >
                              <span className="text-[11px]">🛒</span>
                              <span>{item}</span>
                              <span className="text-[8px] opacity-50">↗</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Ask Vastu Expert */}
                    <button
                      type="button"
                      onClick={() => openVastuAsk(room)}
                      className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-[11px] font-medium transition-all hover:bg-primary/5 active:scale-95"
                      style={{ borderColor: 'rgba(212, 175, 55,0.4)', color: 'var(--text)' }}
                    >
                      <span className="text-[13px]">🔮</span>
                      Ask about this room
                    </button>
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerList>

          {/* General Remedies */}
          {result.generalRemedies.length > 0 && (
            <ScrollReveal>
              <Card className="border-warning/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-1.5 text-sm font-[family-name:var(--font-serif)] text-warning">
                    &#128161; General Vastu Remedies
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {result.generalRemedies.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
                        <span className="mt-0.5 text-warning">&#9679;</span> {r}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </ScrollReveal>
          )}
        </motion.div>
      )}
      {/* "Standing in the Brahmasthan" info modal */}
      {centerInfoOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/45 backdrop-blur-sm"
          onClick={() => setCenterInfoOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-surface border border-border rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden mb-[calc(72px+env(safe-area-inset-bottom))] sm:mb-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center gap-3 px-4 py-3 border-b border-border"
              style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.14), rgba(124,58,237,0.06))' }}
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-xl shrink-0"
                style={{ background: 'rgba(212,175,55,0.18)', border: '1.5px solid rgba(212,175,55,0.45)' }}
              >
                🧘
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-text">You standing in the centre</div>
                <div className="text-[11px] text-text-secondary">Brahmasthan · the sacred core of your home</div>
              </div>
              <button
                onClick={() => setCenterInfoOpen(false)}
                className="text-text-secondary hover:text-text transition-colors text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12px] text-text leading-relaxed">
                The <span className="font-semibold" style={{ color: 'var(--primary)' }}>Brahmasthan</span> is the central zone of your home — the seat of Brahma, the cosmic source. When you stand here, you are at the energetic pivot of the entire space. Every direction radiates outward from this point, so what you place here affects the prana (life force) of the whole house.
              </p>
              <div
                className="rounded-lg p-3"
                style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)' }}
              >
                <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#15803d' }}>✓ Keep this zone</p>
                <ul className="text-[11px] text-text-secondary leading-relaxed list-disc pl-4 space-y-0.5">
                  <li>Open and uncluttered — no heavy furniture</li>
                  <li>Clean, well-lit, easy to walk through</li>
                  <li>A small plant, lamp, or rangoli is auspicious</li>
                </ul>
              </div>
              <div
                className="rounded-lg p-3"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#b91c1c' }}>✗ Avoid here</p>
                <ul className="text-[11px] text-text-secondary leading-relaxed list-disc pl-4 space-y-0.5">
                  <li>Toilets, kitchens, or staircases</li>
                  <li>Pillars, beams, or storage boxes</li>
                  <li>Heavy furniture that blocks movement</li>
                </ul>
              </div>
              <p className="text-[11px] text-text-secondary italic leading-relaxed">
                Stand here for a moment each day — facing east or north — to feel grounded in the centre of your space.
              </p>
            </div>
            <div className="px-4 pb-4">
              <button
                onClick={() => setCenterInfoOpen(false)}
                className="w-full py-2.5 rounded-xl text-[13px] font-semibold cursor-pointer text-white"
                style={{ background: 'linear-gradient(135deg, #c9a227, #b8860b)', border: '1px solid rgba(201,162,39,0.5)' }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ask Vastu Expert modal */}
      {vastuAskModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm" onClick={() => setVastuAskModal(null)}>
          <div
            className="w-full sm:max-w-lg bg-surface border border-border rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden mb-[calc(72px+env(safe-area-inset-bottom))] sm:mb-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border" style={{ backgroundColor: 'var(--surface-2, var(--surface))' }}>
              <span className="text-base">🔮</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-text">Ask about {vastuAskModal.roomLabel}</div>
                <div className="text-[10px] text-text-secondary">
                  {vastuAskLimit - vastuAskModal.qas.length} question{vastuAskLimit - vastuAskModal.qas.length !== 1 ? 's' : ''} remaining
                </div>
              </div>
              <button onClick={() => setVastuAskModal(null)} className="text-text-secondary hover:text-text transition-colors text-lg leading-none">×</button>
            </div>

            {/* Q&A */}
            <div className="px-4 py-3 space-y-3 max-h-[40vh] overflow-y-auto">
              {vastuAskModal.qas.length === 0 && !vastuAskModal.loading && (
                <p className="text-[11px] text-text-secondary text-center py-2">Ask anything about this room — its Vastu effects, remedies, or what to change first.</p>
              )}
              {vastuAskModal.qas.map((qa, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex gap-2">
                    <span className="text-[10px] font-semibold shrink-0 mt-0.5" style={{ color: 'var(--text)' }}>You</span>
                    <p className="text-[11px] text-text leading-relaxed">{qa.q}</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[10px] font-semibold shrink-0 mt-0.5" style={{ color: 'var(--accent, #f59e0b)' }}>Vastu Expert</span>
                    <div className="flex-1 space-y-1.5">
                      <p className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-line">{qa.a}</p>
                      {qa.items.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {qa.items.map((item, j) => (
                            <a
                              key={j}
                              href={`https://www.google.com/search?q=${encodeURIComponent(item + ' buy online india vastu')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-medium transition-all hover:shadow-sm active:scale-95"
                              style={{ borderColor: 'rgba(212, 175, 55,0.35)', backgroundColor: 'var(--bg)', color: 'var(--text)' }}
                            >
                              <span className="text-[10px]">🛒</span>
                              <span>{item}</span>
                              <span className="text-[7px] opacity-50">↗</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {vastuAskModal.loading && (
                <div className="flex gap-2 items-center">
                  <span className="text-[10px] font-semibold shrink-0" style={{ color: 'var(--accent, #f59e0b)' }}>Vastu Expert</span>
                  <span className="text-[11px] text-text-secondary animate-pulse">Consulting the directions…</span>
                </div>
              )}
              {vastuAskModal.error && <p className="text-[11px] text-red-500">{vastuAskModal.error}</p>}
            </div>

            {/* Input */}
            {vastuAskModal.qas.length < vastuAskLimit ? (
              <div className="px-4 pb-4 pt-2 border-t border-border">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={vastuAskModal.input}
                    onChange={(e) => setVastuAskModal((m) => m ? { ...m, input: e.target.value } : m)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitVastuQuestion(); } }}
                    placeholder="e.g. What if I can't move the room?"
                    disabled={vastuAskModal.loading}
                    className="flex-1 rounded-lg border bg-bg px-3 py-2 text-xs text-text placeholder:text-text-secondary/40 focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
                    style={{ borderColor: 'var(--border)' }}
                  />
                  <Button
                    size="sm"
                    onClick={submitVastuQuestion}
                    disabled={vastuAskModal.loading || !vastuAskModal.input.trim()}
                  >
                    Ask
                  </Button>
                </div>
              </div>
            ) : (
              <div className="px-4 pb-4 pt-2 border-t border-border">
                <p className="text-[11px] text-text-secondary text-center">You&apos;ve used both questions for this room.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </MotionPage>
  );
}
