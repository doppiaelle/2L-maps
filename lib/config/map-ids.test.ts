import { readMapIds } from './map-ids';

/**
 * `app.config.ts` can be edited without touching this file, so what arrives here
 * is a boundary like any other — and a typo that reached the SDK as a Map ID
 * would change the map's appearance silently (risk C15).
 */

describe('reading the Map IDs', () => {
  it('takes both when both are configured', () => {
    expect(readMapIds({ mapIds: { light: 'light-id', dark: 'dark-id' } })).toEqual({
      light: 'light-id',
      dark: 'dark-id',
    });
  });

  it('treats an unset build variable as absent', () => {
    // `process.env['…'] ?? ''` is how one arrives. The map then uses Google's
    // default style, which is a working map — a blank one is not.
    expect(readMapIds({ mapIds: { light: '', dark: '   ' } })).toEqual({
      light: null,
      dark: null,
    });
  });

  it('survives configuration that does not mention map IDs at all', () => {
    for (const extra of [undefined, null, {}, { mapIds: 'nonsense' }]) {
      expect(readMapIds(extra)).toEqual({ light: null, dark: null });
    }
  });

  it('refuses a value that is not a string', () => {
    expect(readMapIds({ mapIds: { light: 42, dark: true } })).toEqual({
      light: null,
      dark: null,
    });
  });
});
