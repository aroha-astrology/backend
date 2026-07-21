import { parentPort } from 'node:worker_threads';

if (!parentPort) {
  throw new Error('echo-worker.mjs must run inside a worker thread');
}

parentPort.on('message', (msg) => {
  const { id, type, payload } = msg;

  if (type === 'fail') {
    parentPort.postMessage({ id, error: 'intentional failure' });
    return;
  }

  if (type === 'crash') {
    process.exit(1);
  }

  parentPort.postMessage({ id, result: { type, payload } });
});
