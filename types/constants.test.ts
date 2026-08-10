import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AUTOCOMPLETE_MIN_CHARACTERS,
  COORDINATE_MAX_AGE_DAYS,
  HANDOFF_NOMINAL_WAYPOINTS,
  HANDOFF_URL_MAX_LENGTH,
  LIST_VIRTUALISATION_THRESHOLD,
  MARKER_CLUSTER_THRESHOLD,
  MAX_STOPS,
  MAX_STOPS_T0,
  MAX_STOPS_T1,
  MIN_STOPS,
  TRIAL_DURATION_DAYS,
} from './constants';

/**
 * "Never let a documentation number and a code constant disagree. The constant
 * cites the document; the document is the source." — CLAUDE.md §13 rule 9.
 *
 * That rule is unenforceable by review: a constant edited in one place looks
 * correct in isolation, and the document it contradicts is in another file
 * nobody opened. These tests make the disagreement fail instead.
 *
 * Each case asserts that the value the code uses still appears, verbatim, in the
 * document that owns it. If a number legitimately changes, the document changes
 * first and this test then tells you exactly which constants must follow.
 */

const DOCS = join(__dirname, '..', 'docs');

const read = (file: string): string => readFileSync(join(DOCS, file), 'utf8');

describe('domain constants agree with the documents that own them', () => {
  it('route size matches 01_PRODUCT_REQUIREMENTS', () => {
    expect(read('01_PRODUCT_REQUIREMENTS.md')).toContain(
      `A route accepts between ${MIN_STOPS} and ${MAX_STOPS} stops`,
    );
  });

  it('T0 ceiling matches 15_ROUTE_OPTIMIZATION', () => {
    expect(read('15_ROUTE_OPTIMIZATION.md')).toContain(`stops ≤ ${MAX_STOPS_T0}`);
  });

  it('T1 waypoint ceiling matches 01_PRODUCT_REQUIREMENTS CR-05', () => {
    expect(read('01_PRODUCT_REQUIREMENTS.md')).toContain(
      `at most ${MAX_STOPS_T1} intermediate waypoints`,
    );
  });

  it('coordinate expiry matches 12_DATABASE and the terms it enforces', () => {
    expect(read('12_DATABASE.md')).toContain(`${COORDINATE_MAX_AGE_DAYS} consecutive days`);
    expect(read('32_LEGAL_COMPLIANCE.md')).toContain(`${COORDINATE_MAX_AGE_DAYS} consecutive days`);
  });

  it('handoff URL ceiling matches 16_INTERNAL_NAVIGATION', () => {
    const doc = read('16_INTERNAL_NAVIGATION.md');
    // The document writes it with a thousands separator, as prose does.
    expect(doc).toContain(`${HANDOFF_URL_MAX_LENGTH.toLocaleString('en-US')}-character`);
    expect(doc).toContain(`~${HANDOFF_NOMINAL_WAYPOINTS} waypoints`);
  });

  it('the address-search minimum length matches 04_FEATURES', () => {
    expect(read('04_FEATURES.md')).toContain(`${AUTOCOMPLETE_MIN_CHARACTERS}-character minimum`);
  });

  it('no document still promises a debounce interval no constant backs', () => {
    // The 300 ms constant was deleted with ADR-0019 and the documents were
    // updated in the same change. A document that still quotes an interval would
    // be describing a control the code no longer has (`CLAUDE.md` §13 rule 9).
    // Scoped to a stated number, so the decision log can still record that the
    // debounce existed and why it went.
    for (const name of ['24_PERFORMANCE.md', '33_API_CONTRACTS.md', '04_FEATURES.md']) {
      expect(read(name)).not.toMatch(/\d+\s*ms\b[^.|\n]*debounce/i);
      expect(read(name)).not.toMatch(/debounce[^.|\n]*\d+\s*ms\b/i);
      expect(read(name)).not.toMatch(/debounce\s*≥/i);
    }
  });

  it('rendering thresholds match 24_PERFORMANCE', () => {
    const doc = read('24_PERFORMANCE.md');
    expect(doc).toContain(`Cluster above ${MARKER_CLUSTER_THRESHOLD} markers`);
    expect(doc).toContain(`Virtualise above ${LIST_VIRTUALISATION_THRESHOLD} rows`);
  });

  it('trial length matches 20_SUBSCRIPTIONS', () => {
    expect(read('20_SUBSCRIPTIONS.md')).toContain(`${TRIAL_DURATION_DAYS}-day trial`);
  });
});

describe('the constants are internally coherent', () => {
  it('T0 serves a strict subset of what T1 serves', () => {
    expect(MAX_STOPS_T0).toBeLessThan(MAX_STOPS_T1);
  });

  it('the user-facing cap never exceeds what T1 can order in one call', () => {
    // Above MAX_STOPS_T1 the server escalates to T2, which bills per stop rather
    // than per route — a silent crossing here would multiply COGS ~25×.
    expect(MAX_STOPS).toBeLessThanOrEqual(MAX_STOPS_T1);
  });

  it('a route needs at least two stops to have a leg', () => {
    expect(MIN_STOPS).toBeGreaterThanOrEqual(2);
  });

  it('clustering engages before virtualisation, as the map fills first', () => {
    expect(MARKER_CLUSTER_THRESHOLD).toBeLessThan(LIST_VIRTUALISATION_THRESHOLD);
  });
});
