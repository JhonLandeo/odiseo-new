import { mapWithConcurrency } from './map-with-concurrency.util';

describe('mapWithConcurrency', () => {
  it('maps every item and preserves input order', async () => {
    const result = await mapWithConcurrency([3, 1, 2], 2, async (n) => {
      await new Promise((resolve) => setTimeout(resolve, n));
      return n * 10;
    });

    expect(result).toEqual([30, 10, 20]);
  });

  it('never exceeds the concurrency bound', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    await mapWithConcurrency(
      Array.from({ length: 10 }, (_, i) => i),
      4,
      async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
      },
    );

    expect(maxInFlight).toBeLessThanOrEqual(4);
    // The pool actually parallelizes: with 10 items and a bound of 4, more
    // than one task must have been in flight at once.
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('propagates a task rejection', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });

  it('returns an empty array for no items', async () => {
    const task = jest.fn();
    await expect(mapWithConcurrency([], 4, task)).resolves.toEqual([]);
    expect(task).not.toHaveBeenCalled();
  });

  it('rejects a non-positive or fractional concurrency', async () => {
    await expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toThrow(
      /positive integer concurrency/,
    );
    await expect(mapWithConcurrency([1], 1.5, async (n) => n)).rejects.toThrow(
      /positive integer concurrency/,
    );
  });
});
