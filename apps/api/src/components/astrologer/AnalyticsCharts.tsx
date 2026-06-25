'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface Props {
  last30:  { date: string; label: string; count: number }[];
  topTags: [string, number][];
}

export function AnalyticsCharts({ last30, topTags }: Props) {
  const hasActivity = last30.some(d => d.count > 0);
  const tagData = topTags.slice(0, 6).map(([tag, count]) => ({ tag: tag.length > 14 ? tag.slice(0, 13) + '…' : tag, count }));

  return (
    <>
      {/* Consultations per day */}
      <section className="j-card p-5">
        <h2 className="text-sm font-bold text-text mb-4">Consultations — Last 30 Days</h2>
        {!hasActivity ? (
          <div className="text-sm text-text-muted text-center py-6">No interactions logged yet. Start logging calls, walk-ins, or WhatsApp sessions.</div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={last30} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                interval={4}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 9, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{ background: '#1e1b2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11, color: '#e5e7eb' }}
                cursor={{ fill: 'rgba(124,58,237,0.1)' }}
                formatter={(v: number) => [v, 'interactions']}
              />
              <Bar dataKey="count" fill="#7c3aed" radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Top tags bar chart */}
      {tagData.length > 0 && (
        <section className="j-card p-5">
          <h2 className="text-sm font-bold text-text mb-4">Top Services / Tags</h2>
          <ResponsiveContainer width="100%" height={Math.max(tagData.length * 32 + 20, 80)}>
            <BarChart
              data={tagData}
              layout="vertical"
              margin={{ top: 0, right: 32, left: 0, bottom: 0 }}
            >
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="tag"
                width={110}
                tick={{ fontSize: 10, fill: '#d1d5db' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{ background: '#1e1b2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11, color: '#e5e7eb' }}
                cursor={{ fill: 'rgba(124,58,237,0.1)' }}
                formatter={(v: number) => [v, 'times']}
              />
              <Bar dataKey="count" fill="#f59e0b" radius={[0, 3, 3, 0]} maxBarSize={20} label={{ position: 'right', fontSize: 10, fill: '#9ca3af' }} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}
    </>
  );
}
