import { connectivityOf, isOffline } from './connectivity';

/**
 * The distinction this module exists for is connected versus *reachable*, and
 * every test below is a variation on it. A van in a tunnel, a phone in a lift
 * and a café portal all report an interface; none of them can reach our server.
 */

describe('reading a snapshot', () => {
  it('calls a phone with no interface offline', () => {
    expect(connectivityOf({ isConnected: false, isInternetReachable: false })).toBe('offline');
  });

  it('calls a captive portal offline, even though it is connected', () => {
    // Connected to the café's wifi, signed in to nothing. This is the case that
    // makes `isConnected` the wrong question.
    expect(connectivityOf({ isConnected: true, isInternetReachable: false })).toBe('offline');
  });

  it('trusts reachability over connection when they disagree', () => {
    expect(connectivityOf({ isConnected: false, isInternetReachable: true })).toBe('offline');
  });

  it('is online when something can actually be reached', () => {
    expect(connectivityOf({ isConnected: true, isInternetReachable: true })).toBe('online');
  });

  it('does not wait for the probe before allowing a request', () => {
    // Reachability takes a second or two to confirm. Treating that gap as
    // offline would disable search on a working connection every cold start,
    // and the request itself would have answered the question faster.
    expect(connectivityOf({ isConnected: true, isInternetReachable: null })).toBe('online');
  });

  it('reports the first frame after launch as unknown', () => {
    expect(connectivityOf({ isConnected: null, isInternetReachable: null })).toBe('unknown');
  });
});

describe('whether to stop the user', () => {
  it('stops them only when nothing can be reached', () => {
    expect(isOffline('offline')).toBe(true);
  });

  it('does not refuse on a guess', () => {
    // `unknown` is not a refusal. Blocking a request in order to avoid finding
    // out whether it would have worked is the wrong trade in both directions.
    expect(isOffline('unknown')).toBe(false);
    expect(isOffline('online')).toBe(false);
  });
});
