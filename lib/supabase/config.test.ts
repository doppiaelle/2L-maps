import { readSupabaseConfig, functionsBaseUrl } from './config';

/**
 * `readSupabaseConfig` decides whether this build has a backend at all, and its
 * answer is what the sign-in screen reports as "not available in this build".
 *
 * The bug these tests were written after was not in any branch below: the
 * function read `process.env` through a variable, which Babel cannot substitute
 * into a bundle, so on a device every value was `undefined` and the app said it
 * was unconfigured while the secrets sat correctly in CI. **No unit test can see
 * that** — in Jest `process.env` is a real object and every branch behaves. The
 * check that catches it is in `verify.yml`, which greps the built bundle for
 * values it put in.
 *
 * What is testable is what the function does with what it is given.
 */

describe('deciding whether this build has a backend', () => {
  const env = (url?: string, anonKey?: string) => ({ url, anonKey });

  it('accepts a complete pair', () => {
    expect(readSupabaseConfig(env('https://abc.supabase.co', 'anon'))).toEqual({
      url: 'https://abc.supabase.co',
      anonKey: 'anon',
    });
  });

  it('refuses half a configuration', () => {
    // Half produces a client that resolves every request to a network error,
    // which reads to a user as "the app is broken" rather than "this build was
    // never wired up".
    expect(readSupabaseConfig(env('https://abc.supabase.co', undefined))).toBeNull();
    expect(readSupabaseConfig(env(undefined, 'anon'))).toBeNull();
  });

  it('treats whitespace as absent', () => {
    // A secret pasted with a trailing newline is the ordinary way this goes
    // wrong, and a URL of " " fails later and less clearly than one of "".
    expect(readSupabaseConfig(env('   ', '  '))).toBeNull();
  });

  it('trims what it accepts', () => {
    expect(readSupabaseConfig(env(' https://abc.supabase.co ', ' anon '))?.url).toBe(
      'https://abc.supabase.co',
    );
  });
});

describe('where the Edge Functions live', () => {
  it('derives them from the project URL', () => {
    // One variable rather than two: a second is a second thing to get wrong, in
    // a way that produces a working sign-in and a dead Optimize button.
    expect(functionsBaseUrl({ url: 'https://abc.supabase.co', anonKey: 'a' })).toBe(
      'https://abc.supabase.co/functions/v1',
    );
  });

  it('does not double the slash on a URL that ends with one', () => {
    expect(functionsBaseUrl({ url: 'https://abc.supabase.co/', anonKey: 'a' })).toBe(
      'https://abc.supabase.co/functions/v1',
    );
  });

  it('has nowhere to point when there is no project', () => {
    expect(functionsBaseUrl(null)).toBeNull();
  });
});
