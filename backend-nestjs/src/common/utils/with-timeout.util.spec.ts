import { withTimeout } from './with-timeout.util';

describe('withTimeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the operation result on the fast path', async () => {
    const result = await withTimeout(
      async () => 'ok',
      'fast operation',
      1000,
    );

    expect(result).toBe('ok');
  });

  it('propagates a rejection from the operation itself', async () => {
    await expect(
      withTimeout(
        async () => {
          throw new Error('boom');
        },
        'failing operation',
        1000,
      ),
    ).rejects.toThrow('boom');
  });

  it('rejects with a labeled timeout error when the operation never settles', async () => {
    jest.useFakeTimers();

    const pending = withTimeout(
      () => new Promise<never>(() => {}),
      'hung operation',
      1000,
    );
    const assertion = expect(pending).rejects.toThrow(
      'hung operation timed out after 1000ms',
    );
    await jest.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('leaves no pending timer behind once the operation settles', async () => {
    jest.useFakeTimers();

    await withTimeout(async () => 'ok', 'fast operation', 1000);

    expect(jest.getTimerCount()).toBe(0);
  });
});
