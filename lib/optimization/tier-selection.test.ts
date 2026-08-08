import { MAX_STOPS_T0, MAX_STOPS_T1, MIN_STOPS } from '@/types';

import {
  canOfferLocalFallback,
  isCostEscalation,
  selectTier,
  type TierInput,
} from './tier-selection';

/**
 * Tier boundaries are non-negotiable coverage (CLAUDE.md §5): 8/9 and 25/26 are
 * tested explicitly, from both sides, in every combination of the other inputs.
 *
 * Both boundaries are load-bearing for different reasons. Getting 8/9 wrong ships
 * a straight-line result the user is told is a route. Getting 25/26 wrong either
 * truncates the route silently or crosses a cost cliff — T1 bills per request and
 * T2 per stop, so one stop over is roughly twenty-five times the price.
 */

const online = (stopCount: number, hasConstraints = false): TierInput => ({
  stopCount,
  isUpstreamAvailable: true,
  hasConstraints,
});

const offline = (stopCount: number, hasConstraints = false): TierInput => ({
  stopCount,
  isUpstreamAvailable: false,
  hasConstraints,
});

describe('the 8/9 boundary — T0 is a quality ceiling', () => {
  it('the documented local ceiling is 8', () => {
    expect(MAX_STOPS_T0).toBe(8);
  });

  it('offline with 8 stops selects T0, degraded', () => {
    expect(selectTier(offline(8))).toEqual({ kind: 'selected', tier: 'T0', isDegraded: true });
  });

  it('offline with 9 stops offers nothing rather than a bad order', () => {
    // Refusing is the honest outcome. A straight-line order over nine stops in a
    // city with a one-way system can be worse than the user's own guess.
    expect(selectTier(offline(9))).toEqual({
      kind: 'unavailable',
      reason: 'offline-above-local-limit',
    });
  });

  it('a T0 result is always flagged degraded', () => {
    for (let stops = MIN_STOPS; stops <= MAX_STOPS_T0; stops += 1) {
      expect(selectTier(offline(stops))).toEqual({
        kind: 'selected',
        tier: 'T0',
        isDegraded: true,
      });
    }
  });

  it('being online never selects T0, even at 2 stops', () => {
    // T0 exists for the absence of a network, not for small routes.
    expect(selectTier(online(2))).toEqual({ kind: 'selected', tier: 'T1', isDegraded: false });
  });
});

describe('the 25/26 boundary — T1 is a hard API limit and a cost cliff', () => {
  it('the documented T1 waypoint ceiling is 25', () => {
    expect(MAX_STOPS_T1).toBe(25);
  });

  it('25 stops stays on T1', () => {
    expect(selectTier(online(25))).toEqual({ kind: 'selected', tier: 'T1', isDegraded: false });
  });

  it('26 stops escalates to T2', () => {
    expect(selectTier(online(26))).toEqual({ kind: 'selected', tier: 'T2', isDegraded: false });
  });

  it('escalation to T2 is never flagged degraded — only T0 is', () => {
    expect(selectTier(online(200))).toEqual({ kind: 'selected', tier: 'T2', isDegraded: false });
  });

  it('detects the crossing so the longer wait can be shown in advance', () => {
    expect(isCostEscalation(25, 26)).toBe(true);
    expect(isCostEscalation(24, 25)).toBe(false);
    expect(isCostEscalation(26, 30)).toBe(false); // already over; not a new crossing
    expect(isCostEscalation(30, 20)).toBe(false); // coming back down is not an escalation
  });
});

describe('constraints force T2 regardless of stop count', () => {
  it('two stops with a constraint still goes to T2', () => {
    // Constraint solving is what T2 is for. Stop count is the other trigger, not
    // the only one.
    expect(selectTier(online(2, true))).toEqual({
      kind: 'selected',
      tier: 'T2',
      isDegraded: false,
    });
  });

  it('constraints offline cannot be served at all', () => {
    expect(selectTier(offline(3, true))).toEqual({
      kind: 'unavailable',
      reason: 'offline-with-constraints',
    });
  });

  it('the offline-with-constraints reason wins over the stop-count reason', () => {
    // Both conditions hold at 9 stops with constraints. The message must name the
    // cause the user can act on, and no stop count makes constraints solvable
    // locally.
    expect(selectTier(offline(9, true))).toEqual({
      kind: 'unavailable',
      reason: 'offline-with-constraints',
    });
  });
});

describe('too few stops', () => {
  it('the documented minimum is 2', () => {
    expect(MIN_STOPS).toBe(2);
  });

  it('rejects 0 and 1 stops whether online or offline', () => {
    for (const input of [online(0), online(1), offline(0), offline(1)]) {
      expect(selectTier(input)).toEqual({ kind: 'unavailable', reason: 'too-few-stops' });
    }
  });

  it('accepts exactly 2', () => {
    expect(selectTier(online(2)).kind).toBe('selected');
    expect(selectTier(offline(2)).kind).toBe('selected');
  });

  it('too-few-stops is reported before any offline reason', () => {
    // One stop offline is not an offline problem; adding a network would not fix
    // it. The error must name the cause the user can act on.
    expect(selectTier(offline(1, true))).toEqual({
      kind: 'unavailable',
      reason: 'too-few-stops',
    });
  });
});

describe('local fallback after an upstream failure', () => {
  it('is offered at and below the local ceiling', () => {
    expect(canOfferLocalFallback(2, false)).toBe(true);
    expect(canOfferLocalFallback(8, false)).toBe(true);
  });

  it('is not offered above it', () => {
    expect(canOfferLocalFallback(9, false)).toBe(false);
  });

  it('is not offered below the minimum', () => {
    expect(canOfferLocalFallback(1, false)).toBe(false);
  });

  it('is never offered when constraints are present', () => {
    // The local heuristic cannot honour a time window, so offering it would
    // silently drop the requirement the user asked for.
    expect(canOfferLocalFallback(5, true)).toBe(false);
  });
});
