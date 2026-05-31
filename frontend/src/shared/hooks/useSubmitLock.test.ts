import { describe, expect, it } from 'vitest';

import { createSubmitLock } from './submitLock';

describe('createSubmitLock', () => {
  it('deduplicates concurrent submissions and unlocks after completion', async () => {
    const lock = createSubmitLock();
    let calls = 0;
    const submit = () =>
      lock.run(async () => {
        calls += 1;
        return 'saved';
      });

    const [first, second] = await Promise.all([submit(), submit()]);

    expect(first).toBe('saved');
    expect(second).toBeUndefined();
    expect(calls).toBe(1);
    expect(lock.isLocked()).toBe(false);

    await submit();
    expect(calls).toBe(2);
  });
});
