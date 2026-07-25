// =============================================================================
// Generic worker_threads pool: round-robin dispatch, crash/respawn handling.
// Not specific to ephemeris — kept generic so it's testable without swisseph.
// =============================================================================

import { Worker } from 'node:worker_threads';

export interface WorkerPoolOptions {
  workerUrl: URL;
  size: number;
  execArgv?: string[];
}

interface PendingTask {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

interface WorkerMessage {
  id: number;
  result?: unknown;
  error?: string;
}

class PooledWorker {
  private worker: Worker;
  private readonly pending = new Map<number, PendingTask>();

  constructor(private readonly options: WorkerPoolOptions) {
    this.worker = this.spawn();
  }

  private spawn(): Worker {
    const worker = new Worker(this.options.workerUrl, {
      execArgv: this.options.execArgv ?? [],
    });

    worker.on('message', (msg: WorkerMessage) => {
      const task = this.pending.get(msg.id);
      if (!task) return;
      this.pending.delete(msg.id);
      if (msg.error !== undefined) {
        task.reject(new Error(msg.error));
      } else {
        task.resolve(msg.result);
      }
    });

    worker.on('error', (err) => this.handleFailure(err));
    worker.on('exit', (code) => {
      if (code !== 0) this.handleFailure(new Error(`ephemeris worker exited with code ${code}`));
    });

    return worker;
  }

  private handleFailure(error: unknown): void {
    for (const task of this.pending.values()) {
      task.reject(error);
    }
    this.pending.clear();
    this.worker = this.spawn();
  }

  run<T>(type: string, payload: unknown, id: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject } as PendingTask);
      this.worker.postMessage({ id, type, payload });
    });
  }
}

export class WorkerPool {
  private readonly workers: PooledWorker[];
  private next = 0;
  private nextTaskId = 0;

  constructor(options: WorkerPoolOptions) {
    if (options.size <= 0) {
      throw new Error('WorkerPool size must be positive');
    }
    this.workers = Array.from({ length: options.size }, () => new PooledWorker(options));
  }

  run<T>(type: string, payload: unknown): Promise<T> {
    const worker = this.workers[this.next] as PooledWorker;
    this.next = (this.next + 1) % this.workers.length;
    return worker.run<T>(type, payload, this.nextTaskId++);
  }
}
