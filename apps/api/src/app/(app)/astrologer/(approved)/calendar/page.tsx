'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

interface Client { id: string; name: string; }
interface Slot {
  id: string;
  start_at: string;
  end_at: string;
  status: 'open' | 'booked' | 'completed' | 'cancelled' | 'no_show';
  notes: string | null;
  customer_id: string | null;
  astrologer_customers?: { name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  open:       'bg-accent/20 text-accent border-accent/30',
  booked:     'bg-blue-500/20 text-blue-300 border-blue-500/30',
  completed:  'bg-green-500/20 text-green-300 border-green-500/30',
  cancelled:  'bg-red-500/20 text-red-300 border-red-500/30',
  no_show:    'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
};

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export const dynamic = 'force-dynamic';

export default function CalendarPage() {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [slots,   setSlots]   = useState<Slot[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [form, setForm] = useState({ start_time: '10:00', end_time: '11:00', customer_id: '', notes: '', status: 'open' as Slot['status'] });
  const [saving, setSaving] = useState(false);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
    const lastDay  = new Date(year, month + 1, 0).toISOString().split('T')[0];
    const res = await fetch(`/api/astrologer/slots?from=${firstDay}&to=${lastDay}`);
    const j = await res.json();
    setSlots(j.slots ?? []);
    setLoading(false);
  }, [year, month]);

  useEffect(() => { loadSlots(); }, [loadSlots]);

  useEffect(() => {
    fetch('/api/astrologer/clients').then(r => r.json()).then(d => setClients(d.clients ?? []));
  }, []);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const slotsByDay = slots.reduce<Record<number, Slot[]>>((acc, s) => {
    const d = new Date(s.start_at).getDate();
    (acc[d] ??= []).push(s);
    return acc;
  }, {});

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow    = new Date(year, month, 1).getDay();

  const openModal = (day: number) => {
    const d = new Date(year, month, day);
    setSelectedDay(d);
    setForm({ start_time: '10:00', end_time: '11:00', customer_id: '', notes: '', status: 'open' });
    setShowModal(true);
  };

  const saveSlot = async () => {
    if (!selectedDay) return;
    setSaving(true);
    try {
      const dateStr = selectedDay.toISOString().split('T')[0];
      const body = {
        start_at:    `${dateStr}T${form.start_time}:00+05:30`,
        end_at:      `${dateStr}T${form.end_time}:00+05:30`,
        customer_id: form.customer_id || null,
        notes:       form.notes || null,
        status:      form.status,
      };
      const res = await fetch('/api/astrologer/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { toast.error('Failed to create slot'); return; }
      toast.success('Slot created');
      setShowModal(false);
      loadSlots();
    } finally { setSaving(false); }
  };

  const deleteSlot = async (id: string) => {
    const res = await fetch(`/api/astrologer/slots/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Slot deleted'); loadSlots(); }
    else toast.error('Failed to delete');
  };

  const todaySlots = slots
    .filter(s => new Date(s.start_at).toDateString() === today.toDateString())
    .sort((a, b) => a.start_at.localeCompare(b.start_at));

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="j-display text-2xl text-text font-bold">Calendar</h1>
        <button onClick={() => openModal(today.getDate())} className="j-btn j-btn-primary text-sm">+ New Slot</button>
      </div>

      {/* Today's slots summary */}
      {todaySlots.length > 0 && (
        <div className="j-card p-4">
          <div className="text-xs font-bold text-accent uppercase tracking-wider mb-2">Today</div>
          <div className="space-y-2">
            {todaySlots.map(s => (
              <SlotRow key={s.id} slot={s} onDelete={deleteSlot} />
            ))}
          </div>
        </div>
      )}

      {/* Month nav */}
      <div className="j-card p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="px-3 py-1.5 rounded-md border border-border text-text-2 text-sm hover:border-accent">‹</button>
          <span className="text-text font-semibold">{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} className="px-3 py-1.5 rounded-md border border-border text-text-2 text-sm hover:border-accent">›</button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => (
            <div key={d} className="text-center text-[10px] text-text-muted font-bold py-1">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        {loading ? (
          <div className="text-center text-text-muted text-sm py-8">Loading…</div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const daySlots = slotsByDay[day] ?? [];
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              return (
                <button
                  key={day}
                  onClick={() => openModal(day)}
                  className={`min-h-[64px] rounded-md p-1 text-left border transition-colors ${
                    isToday ? 'border-accent bg-accent/5' : 'border-border bg-card hover:border-accent/40'
                  }`}
                >
                  <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-accent' : 'text-text-2'}`}>{day}</div>
                  {daySlots.slice(0, 2).map(s => (
                    <div key={s.id} className={`text-[9px] rounded px-1 py-0.5 mb-0.5 truncate border ${STATUS_COLORS[s.status]}`}>
                      {new Date(s.start_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      {s.astrologer_customers?.name ? ` · ${s.astrologer_customers.name.split(' ')[0]}` : ''}
                    </div>
                  ))}
                  {daySlots.length > 2 && <div className="text-[9px] text-text-muted">+{daySlots.length - 2} more</div>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Upcoming slots list */}
      <section>
        <h2 className="text-sm font-bold text-text mb-2">Upcoming Slots</h2>
        {slots.filter(s => new Date(s.start_at) >= today).length === 0 ? (
          <div className="j-card p-5 text-center text-text-muted text-sm">No upcoming slots. Tap a day to add one.</div>
        ) : (
          <div className="space-y-2">
            {slots.filter(s => new Date(s.start_at) >= today).slice(0, 20).map(s => (
              <SlotRow key={s.id} slot={s} onDelete={deleteSlot} />
            ))}
          </div>
        )}
      </section>

      {/* Create slot modal */}
      {showModal && selectedDay && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-md space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-text">New Slot — {selectedDay.toLocaleDateString('en-IN', { day:'numeric', month:'long' })}</h2>
              <button onClick={() => setShowModal(false)} className="text-text-muted text-xl leading-none">×</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Start time</label>
                <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text" />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">End time</label>
                <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">Client (optional)</label>
              <select value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text">
                <option value="">Open slot (no client yet)</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">Status</label>
              <div className="flex gap-2 flex-wrap">
                {(['open','booked'] as const).map(s => (
                  <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))}
                    className={`px-3 py-1.5 rounded-md border text-xs ${form.status === s ? 'border-accent bg-accent/10 text-text' : 'border-border bg-card text-text-2'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                placeholder="e.g. Career reading, follow-up session"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text" />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowModal(false)} className="flex-1 j-btn text-sm border border-border bg-card text-text-2">Cancel</button>
              <button onClick={saveSlot} disabled={saving} className="flex-1 j-btn j-btn-primary text-sm disabled:opacity-60">
                {saving ? 'Saving…' : 'Create Slot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SlotRow({ slot, onDelete }: { slot: Slot; onDelete: (id: string) => void }) {
  const start = new Date(slot.start_at);
  const end   = new Date(slot.end_at);
  return (
    <div className={`j-card p-3 flex items-center justify-between gap-3 border ${STATUS_COLORS[slot.status]}`}>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-text truncate">
          {start.toLocaleDateString('en-IN', { day:'numeric', month:'short' })} · {start.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true })} – {end.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true })}
        </div>
        {slot.astrologer_customers?.name && (
          <div className="text-xs text-text-muted">{slot.astrologer_customers.name}</div>
        )}
        {slot.notes && <div className="text-xs text-text-muted truncate">{slot.notes}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[10px] px-2 py-0.5 rounded border ${STATUS_COLORS[slot.status]}`}>{slot.status}</span>
        {slot.customer_id && (
          <Link href={`/astrologer/clients/${slot.customer_id}`} className="text-accent text-xs no-underline">View</Link>
        )}
        <button onClick={() => onDelete(slot.id)} className="text-text-muted hover:text-red-400 text-xs">✕</button>
      </div>
    </div>
  );
}
