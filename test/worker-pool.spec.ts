import { describe, it, expect } from 'vitest';
import { WorkerPool } from '../src/lib/astro-engine/calculations/worker-pool.js';

const workerUrl = new URL('./fixtures/echo-worker.mjs', import.meta.url);

describe('WorkerPool', () => {
  it('round-trips a task through a single worker', async () => {
    const pool = new WorkerPool({ workerUrl, size: 1 });
    const result = await pool.run<{ type: string; payload: unknown }>('echo', { a: 1 });
    expect(result).toEqual({ type: 'echo', payload: { a: 1 } });
  }, 10_000);

  it('dispatches many concurrent tasks across workers without mixing up results', async () => {
    const pool = new WorkerPool({ workerUrl, size: 3 });
    const tasks = Array.from({ length: 20 }, (_, i) =>
      pool.run<{ type: string; payload: unknown }>('echo', { n: i }),
    );
    const results = await Promise.all(tasks);
    results.forEach((r, i) => expect(r).toEqual({ type: 'echo', payload: { n: i } }));
  }, 10_000);

  it('rejects when the worker reports an error', async () => {
    const pool = new WorkerPool({ workerUrl, size: 1 });
    await expect(pool.run('fail', {})).rejects.toThrow('intentional failure');
  }, 10_000);

  it('respawns after a worker crash and keeps serving new tasks', async () => {
    const pool = new WorkerPool({ workerUrl, size: 1 });
    await expect(pool.run('crash', {})).rejects.toThrow();
    // The pool must have respawned — this should still succeed.
    const result = await pool.run<{ type: string; payload: unknown }>('echo', { ok: true });
    expect(result).toEqual({ type: 'echo', payload: { ok: true } });
  }, 10_000);
});
