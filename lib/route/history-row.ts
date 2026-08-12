import { formatDistance, formatDuration } from '@/lib/format/units';

import { displayName } from './persistence';
import type { SavedRouteStop, SavedRouteSummary } from './persistence';

/**
 * One History row, decided.
 *
 * **The reported problem was that a row said nothing about which day it was.**
 * A name most routes do not have, a distance and a duration — three facts that
 * are identical across a week of rounds. A driver looking for last Tuesday's
 * deliveries had to open routes until they found it.
 *
 * So the row answers four questions at a glance, in the order a driver asks
 * them: **when**, **how big**, **where from and to**, and **how far**. Every one
 * of them is already in hand — the endpoints come from the same query, through
 * the foreign key `stops` already has to `places_cache` — so the row costs no
 * upstream call and no unit of quota.
 *
 * It is a pure function because the interesting parts are rules, not layout: a
 * route whose addresses have expired must degrade to something still useful
 * rather than to a blank, a round trip has one endpoint rather than two, and the
 * order shown must be the order that was driven.
 */

export type HistoryStatus = 'in-progress' | 'done';

export interface HistoryRow {
  readonly routeId: string;
  /** The route's name, or the date and the stop count — which is how a driver
   *  actually looks for last Tuesday's round. */
  readonly title: string;
  /** `12 stops · one way`. The shape matters: a round trip that ends where it
   *  began is a different day from a one-way run that does not. */
  readonly meta: string;
  /**
   * `Corso Francia → Via Meucci`, or null.
   *
   * Null whenever the thirty-day purge has taken the words, which is the
   * ordinary state of an old route. The row shows what it still knows rather
   * than a placeholder that fills the space and says nothing.
   */
  readonly journey: string | null;
  readonly metrics: string | null;
  readonly status: HistoryStatus | null;
  readonly isDegraded: boolean;
  /** The whole row as one utterance. A screen reader walking a title, a meta
   *  line, a journey and two metrics as five stops learns the same thing five
   *  times and cannot tell where one route ends and the next begins. */
  readonly spoken: string;
}

export function historyRowOf(summary: SavedRouteSummary, locale = 'en-GB'): HistoryRow {
  const title = displayName(summary, locale);
  const shape = summary.isRoundTrip ? 'round trip' : 'one way';
  const stops = `${summary.stopCount} ${summary.stopCount === 1 ? 'stop' : 'stops'}`;

  const journey = journeyOf(summary);
  const metrics = metricsOf(summary);
  const status = statusOf(summary);

  return {
    routeId: summary.routeId,
    title,
    meta: `${stops} · ${shape}`,
    journey,
    metrics,
    status,
    isDegraded: summary.isDegraded,
    spoken: [
      title,
      `${stops}, ${shape}`,
      journey === null ? null : journey.replace('→', 'to'),
      metrics,
      status === 'in-progress' ? 'in progress' : status === 'done' ? 'finished' : null,
      summary.isDegraded ? 'estimated without traffic' : null,
    ]
      .filter((part): part is string => part !== null)
      .join(', '),
  };
}

/**
 * Where the day started and where it ended.
 *
 * **In the order it was driven.** `optimized_order` when there is one, entry
 * order otherwise — the same rule `fromRows` sorts by, because a route reopened
 * in one order and listed in another is two answers to one question.
 *
 * A round trip shows one endpoint, not two: "Corso Francia → Corso Francia" is
 * a fact about the shape that `meta` already states more clearly.
 */
function journeyOf(summary: SavedRouteSummary): string | null {
  const ordered = [...summary.stops].sort(
    (a, b) => (a.optimizedOrder ?? a.entryOrder) - (b.optimizedOrder ?? b.entryOrder),
  );

  const first = shortAddress(ordered[0]);
  const last = shortAddress(ordered[ordered.length - 1]);

  if (first === null) return null;
  if (summary.isRoundTrip || ordered.length < 2) return first;
  // The other end has expired but this one has not. Half an answer beats none:
  // "started at Corso Francia" is still the thing the driver is scanning for.
  return last === null ? first : `${first} → ${last}`;
}

/**
 * The first line of a formatted address.
 *
 * `formatted_address` is the full postal form — "Via Roma 12, 10121 Torino TO,
 * Italia" — which at row width truncates in the middle of the postcode and
 * identifies nothing. The first component is the street and number, which is
 * both what the driver recognises and what Google's own autocomplete puts on its
 * first line.
 */
function shortAddress(stop: SavedRouteStop | undefined): string | null {
  const address = stop?.address ?? null;
  if (address === null) return null;

  const first = address.split(',')[0]?.trim() ?? '';
  return first === '' ? null : first;
}

function metricsOf(summary: SavedRouteSummary): string | null {
  const distance =
    summary.distanceMeters === null ? null : formatDistance(summary.distanceMeters, 'en-CA');
  // Null for a degraded route, which has an ordering and no road timing. Showing
  // a blank rather than a number is the honest half of the same rule the chip
  // states out loud (`CLAUDE.md` §7 rule 6).
  const duration =
    summary.durationSeconds === null ? null : formatDuration(summary.durationSeconds);

  const parts = [distance, duration].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}

/**
 * Which of the two states worth saying out loud this route is in.
 *
 * `optimized` and `draft` get nothing: they are the ordinary state of a row in
 * History and a chip on every row is a chip that means nothing. `archived` gets
 * nothing either — an archived route is not shown at all.
 */
function statusOf(summary: SavedRouteSummary): HistoryStatus | null {
  if (summary.status === 'in_progress') return 'in-progress';
  if (summary.status === 'completed') return 'done';
  return null;
}
