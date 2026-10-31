import { describe, expect, it } from 'vitest';
import { createQueue } from '../src/api/queue';

describe('createQueue', () => {
  it('never runs more tasks at once than its limit, and finishes them all', async () => {
    const queue = createQueue(3);
    let active = 0;
    let peak = 0;
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return 1;
    };
    const results = await Promise.all(Array.from({ length: 20 }, () => queue.run(task)));
    expect(results).toHaveLength(20);
    expect(peak).toBe(3);
  });

  it('keeps going after a task fails', async () => {
    const queue = createQueue(1);
    await expect(queue.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(queue.run(async () => 'ok')).resolves.toBe('ok');
  });
});
