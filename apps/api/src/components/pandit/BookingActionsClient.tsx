'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

interface Props {
  bookingId: string;
  isPending: boolean;
  isAccepted: boolean;
  needsVideoUpload: boolean;
  needsPrasadDispatch: boolean;
  existingVideoUrl: string | null;
}

export function BookingActionsClient({
  bookingId,
  isPending,
  isAccepted,
  needsVideoUpload,
  needsPrasadDispatch,
  existingVideoUrl,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [declineMessage, setDeclineMessage] = useState('');
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(existingVideoUrl);
  const fileRef = useRef<HTMLInputElement>(null);

  const accept = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/pandit/bookings/${bookingId}/accept`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to accept');
      toast.success('Booking accepted');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    if (declineMessage.trim().length < 5) {
      toast.error('Please add a short note for the user');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/pandit/bookings/${bookingId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: declineMessage.trim() }),
      });
      if (!res.ok) throw new Error('Failed to decline');
      toast.success('Booking declined — user will pick another pandit');
      setShowDecline(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const uploadVideo = async (file: File) => {
    setVideoUploading(true);
    try {
      const supabase = createClient();
      const path = `${bookingId}.mp4`;
      const { error } = await supabase.storage
        .from('ritual-videos')
        .upload(path, file, { upsert: true, contentType: file.type || 'video/mp4' });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from('ritual-videos').getPublicUrl(path);

      const res = await fetch(`/api/pandit/bookings/${bookingId}/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: data.publicUrl }),
      });
      if (!res.ok) throw new Error('Failed to record video URL');
      setVideoUrl(data.publicUrl);
      toast.success('Video uploaded — user notified');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setVideoUploading(false);
    }
  };

  const dispatchPrasad = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/pandit/bookings/${bookingId}/prasad-dispatched`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to mark dispatched');
      toast.success('Marked as dispatched — user notified');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      {isPending && (
        <div className="j-card p-5 border-2 border-accent/40">
          <h2 className="text-sm font-bold text-text mb-3">Respond to this booking</h2>
          {!showDecline ? (
            <div className="flex gap-3">
              <button onClick={accept} disabled={busy} className="j-btn j-btn-primary flex-1 disabled:opacity-60">
                Accept
              </button>
              <button onClick={() => setShowDecline(true)} disabled={busy} className="j-btn j-btn-secondary flex-1">
                Decline
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={declineMessage}
                onChange={e => setDeclineMessage(e.target.value)}
                placeholder="Short note for the user (e.g. travelling on that date)"
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-text"
                rows={3}
              />
              <div className="flex gap-2">
                <button onClick={decline} disabled={busy} className="j-btn j-btn-primary flex-1 disabled:opacity-60">
                  Send decline
                </button>
                <button onClick={() => setShowDecline(false)} className="j-btn j-btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isAccepted && needsVideoUpload && (
        <div className="j-card p-5">
          <h2 className="text-sm font-bold text-text mb-3">Record Ritual Video</h2>
          {videoUrl ? (
            <div className="text-sm text-text-2 mb-3">
              ✔ Video already uploaded. {' '}
              <a href={videoUrl} target="_blank" rel="noreferrer" className="text-accent">View</a>
            </div>
          ) : (
            <p className="text-sm text-text-muted mb-3">Upload a 2-5 minute personalised video for the devotee.</p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadVideo(f); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={videoUploading}
            className="j-btn j-btn-primary disabled:opacity-60"
          >
            {videoUploading ? 'Uploading…' : videoUrl ? 'Replace video' : 'Upload video'}
          </button>
        </div>
      )}

      {needsPrasadDispatch && (
        <div className="j-card p-5">
          <h2 className="text-sm font-bold text-text mb-3">Prasad Dispatch</h2>
          <p className="text-sm text-text-muted mb-3">Pack the prasad box and mark dispatched once handed to the courier.</p>
          <button onClick={dispatchPrasad} disabled={busy} className="j-btn j-btn-primary disabled:opacity-60">
            Mark Dispatched
          </button>
        </div>
      )}
    </section>
  );
}
