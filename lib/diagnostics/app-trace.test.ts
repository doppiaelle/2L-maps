import {
  clearAppTrace,
  formatAppTrace,
  getAppTraceEntries,
  shortId,
  subscribeAppTrace,
  trace,
} from './app-trace';

describe('app trace', () => {
  beforeEach(() => {
    clearAppTrace();
  });

  it('formats events and redacts sensitive keys', () => {
    trace({
      level: 'info',
      area: 'api',
      event: 'request_start',
      data: {
        path: '/optimize',
        authorization: 'Bearer secret',
        nested: { apiKey: 'google-secret', safe: 3 },
      },
    });

    const output = formatAppTrace();

    expect(output).toContain('INFO api.request_start');
    expect(output).toContain('/optimize');
    expect(output).toContain('[redacted]');
    expect(output).not.toContain('Bearer secret');
    expect(output).not.toContain('google-secret');
  });

  it('notifies listeners when an event arrives', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAppTrace(listener);

    trace({ level: 'warn', area: 'routes', event: 'save_failed' });
    unsubscribe();
    trace({ level: 'warn', area: 'routes', event: 'save_failed_again' });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps route ids readable without logging the full id', () => {
    expect(shortId('1234567890abcdef')).toBe('123456...cdef');
    expect(getAppTraceEntries().length).toBeGreaterThan(0);
  });
});
