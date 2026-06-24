'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface Client { id: string; name: string; }

interface Props {
  open:     boolean;
  onClose:  () => void;
  onSaved?: () => void;
}

const TOPICS = ['Career','Marriage','Health','Finance','Remedies','Spiritual','Children','Property','Travel','Education','Business','Other'];

export function WalkInLogSheet({ open, onClose, onSaved }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId,   setClientId]   = useState('');
  const [newName,    setNewName]     = useState('');
  const [newDob,     setNewDob]      = useState('');
  const [isNewClient, setIsNewClient] = useState(false);
  const [topic,      setTopic]       = useState('');
  const [customTag,  setCustomTag]   = useState('');
  const [duration,   setDuration]    = useState('');
  const [feeRs,      setFeeRs]       = useState('');
  const [notes,      setNotes]       = useState('');
  const [saving,     setSaving]      = useState(false);

  useEffect(() => {
    if (open) {
      fetch('/api/astrologer/clients').then(r => r.json()).then(d => setClients(d.clients ?? []));
    }
  }, [open]);

  if (!open) return null;

  const reset = () => {
    setClientId(''); setNewName(''); setNewDob(''); setIsNewClient(false);
    setTopic(''); setCustomTag(''); setDuration(''); setFeeRs(''); setNotes('');
  };

  const handleClose = () => { reset(); onClose(); };

  const save = async () => {
    const tag = customTag.trim() || topic;
    if (!isNewClient && !clientId) { toast.error('Select a client or add a new one'); return; }
    if (isNewClient && !newName.trim()) { toast.error('Enter the client name'); return; }

    setSaving(true);
    try {
      let resolvedClientId = clientId;

      // Create quick client if new
      if (isNewClient) {
        const res = await fetch('/api/astrologer/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName, dob: newDob || null }),
        });
        const j = await res.json();
        if (!res.ok) { toast.error(j.error ?? 'Failed to create client'); return; }
        resolvedClientId = j.id;
      }

      // Log the in-person interaction
      const body = {
        customer_id:  resolvedClientId,
        kind:         'in_person',
        direction:    'inbound',
        tag:          tag || null,
        duration_sec: duration ? parseInt(duration) * 60 : null,
        fee_rs:       feeRs ? parseInt(feeRs) : null,
        body:         notes || null,
        occurred_at:  new Date().toISOString(),
      };

      const logRes = await fetch('/api/astrologer/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!logRes.ok) { toast.error('Failed to log session'); return; }
      toast.success('Walk-in session logged');
      reset();
      onClose();
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-text">Log Walk-in Session</h2>
          <button onClick={handleClose} className="text-text-muted text-xl leading-none">×</button>
        </div>

        {/* Client selection */}
        <div>
          <div className="flex gap-2 mb-2">
            <button onClick={() => setIsNewClient(false)} className={`text-xs px-3 py-1.5 rounded-md border ${!isNewClient ? 'border-accent bg-accent/10 text-text' : 'border-border bg-card text-text-2'}`}>Existing client</button>
            <button onClick={() => setIsNewClient(true)}  className={`text-xs px-3 py-1.5 rounded-md border ${isNewClient  ? 'border-accent bg-accent/10 text-text' : 'border-border bg-card text-text-2'}`}>New client</button>
          </div>

          {!isNewClient ? (
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text">
              <option value="">Select client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <div className="space-y-2">
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Client name *"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text" />
              <input value={newDob} onChange={e => setNewDob(e.target.value)}
                placeholder="Date of birth (YYYY-MM-DD)"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text" />
            </div>
          )}
        </div>

        {/* Topic */}
        <div>
          <label className="block text-xs text-text-muted mb-2">Topic discussed</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {TOPICS.map(t => (
              <button key={t} onClick={() => setTopic(t === topic ? '' : t)}
                className={`text-xs px-2.5 py-1 rounded-full border ${topic === t ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-card text-text-2'}`}>
                {t}
              </button>
            ))}
          </div>
          <input value={customTag} onChange={e => setCustomTag(e.target.value)}
            placeholder="Or type a custom topic…"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text" />
        </div>

        {/* Duration + Fee */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Duration (minutes)</label>
            <input type="number" value={duration} onChange={e => setDuration(e.target.value)}
              placeholder="30"
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Fee collected (₹)</label>
            <input type="number" value={feeRs} onChange={e => setFeeRs(e.target.value)}
              placeholder="500"
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text" />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs text-text-muted mb-1">Notes / next steps</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="e.g. Suggested Jupiter remedy, follow-up in 3 months"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text" />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={handleClose} className="flex-1 j-btn border border-border bg-card text-text-2 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 j-btn j-btn-primary text-sm disabled:opacity-60">
            {saving ? 'Saving…' : 'Log Session'}
          </button>
        </div>
      </div>
    </div>
  );
}
