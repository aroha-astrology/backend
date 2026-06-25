'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';

export const dynamic = 'force-dynamic';

interface Message { role: 'user' | 'assistant'; content: string; }
interface ClientInfo { id: string; name: string; dob: string | null; }

export default function AiChatPage() {
  const { id: customerId } = useParams<{ id: string }>();
  const [client, setClient]     = useState<ClientInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch(`/api/astrologer/clients/${customerId}`)
      .then(r => r.json())
      .then(d => setClient(d));
  }, [customerId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || streaming) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setStreaming(true);

    let assistantText = '';
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question:   q,
          customerId,
          mode:       'text',
          history:    messages.slice(-10),
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.text();
        toast.error(`Error: ${err.slice(0, 120)}`);
        setMessages(prev => prev.slice(0, -1));
        return;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const j = JSON.parse(line.slice(6));
            if (j.error) { toast.error(j.error); break; }
            if (j.done) break;
            if (j.replace) { assistantText = j.token; }
            else { assistantText += j.token ?? ''; }
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: assistantText };
              return updated;
            });
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (e) {
      toast.error((e as Error).message);
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] max-w-2xl mx-auto px-4">
      {/* Header */}
      <div className="py-4 border-b border-border flex items-center gap-3">
        <Link href={`/astrologer/clients/${customerId}`} className="text-text-muted text-sm no-underline">← Back</Link>
        <div>
          <h1 className="text-base font-bold text-text">Premium AI Consultation</h1>
          {client && <p className="text-xs text-text-muted">{client.name}{client.dob ? ` · ${client.dob}` : ''} — 2 Dhanam/turn</p>}
        </div>
        <span className="ml-auto text-xs px-2 py-1 bg-accent/20 text-accent rounded font-semibold">PAID</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-text-muted text-sm py-12 space-y-2">
            <div className="text-3xl">🔮</div>
            <p>Ask anything about {client?.name ?? 'this client'}&apos;s chart</p>
            <p className="text-xs">This session is based on their birth chart. Each message deducts 2 Dhanam.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
              m.role === 'user'
                ? 'bg-accent/20 text-text border border-accent/30'
                : 'bg-card border border-border text-text-2'
            }`}>
              {m.role === 'assistant' && m.content === '' && streaming ? (
                <span className="animate-pulse text-text-muted">…</span>
              ) : m.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="py-3 border-t border-border">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={streaming}
            rows={1}
            placeholder={`Ask about ${client?.name ?? 'this client'}'s chart…`}
            className="flex-1 bg-card border border-border rounded-xl px-4 py-3 text-sm text-text resize-none focus:border-accent outline-none disabled:opacity-50"
            style={{ minHeight: 44, maxHeight: 120 }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || streaming}
            className="j-btn j-btn-primary px-4 py-3 shrink-0 disabled:opacity-40"
          >
            {streaming ? '…' : '↑'}
          </button>
        </div>
        <p className="text-[10px] text-text-muted mt-1.5 text-center">Enter to send · Shift+Enter for new line · Each turn = 2 Dhanam</p>
      </div>
    </div>
  );
}
