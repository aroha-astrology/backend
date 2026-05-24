import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────
// Statistics
// ─────────────────────────────────────────────────────────

export function p(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

export function ms(n: number | undefined | null): string {
  if (n == null || n === 0) return 'N/A';
  if (n < 1000) return `${n}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

export function fmt(n: number | undefined | null): string {
  if (n == null) return 'N/A';
  return n.toLocaleString('en-IN');
}

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface PollEntry {
  t_offset_ms: number;     // ms since report flow started
  status: string;
  progress?: string;       // e.g. "8/20"
}

export interface ReportResult {
  tier: 'basic' | 'standard';
  report_id?: string;
  http_generate: number;
  error_code?: string;
  error_msg?: string;
  wall_clock_start: number;    // Date.now() when flow began
  t_generate_ms: number;       // time for generate API call to return 200
  t_queue_ms?: number;         // 200 returned → first 'generating' poll
  t_process_ms?: number;       // 'generating' → 'ai_ready'
  t_render_ms?: number;        // 'ai_ready' → 'completed'
  t_e2e_ms?: number;           // total wall time
  final_status: string;
  poll_count: number;
  poll_log: PollEntry[];       // full per-poll history
  progress_seen: string[];     // NIM progress snapshots
}

export interface ChatResult {
  msg_idx: number;
  question: string;
  http_status: number;
  error_code?: string;
  t_first_token_ms?: number;
  t_full_ms?: number;
  token_count?: number;
}

export interface UserResult {
  user_idx: number;
  email: string;
  name: string;
  round: 'round_1' | 'round_2' | 'round_3';
  report: ReportResult;
  chats?: ChatResult[];
}

// ─────────────────────────────────────────────────────────
// Result store with mutex-safe JSONL writer
// ─────────────────────────────────────────────────────────

export class ResultStore {
  private results: UserResult[] = [];
  private logPath: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(runDir: string) {
    fs.mkdirSync(runDir, { recursive: true });
    this.logPath = path.join(runDir, 'events.jsonl');
  }

  append(result: UserResult): void {
    this.results.push(result);
    const line = JSON.stringify({ ts: new Date().toISOString(), ...result }) + '\n';
    this.writeChain = this.writeChain.then(() =>
      new Promise<void>((resolve, reject) =>
        fs.appendFile(this.logPath, line, (err) => (err ? reject(err) : resolve()))
      )
    );
  }

  getAll(): UserResult[] { return this.results; }

  async flush(): Promise<void> { await this.writeChain; }
}
