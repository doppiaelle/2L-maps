import { MAX_STOPS } from '../../../../types/constants.ts';
import { ApiError } from '../errors.ts';

const ORS_ENDPOINT = 'https://api.heigit.org/vroom/v0/optimization';
const HERE_ENDPOINT = 'https://router.hereapi.com/v8/routes';
const MIN_ROUTE_POINTS = 3;
const DEFAULT_TIMEOUT_MS = 15_000;

export interface HybridStop {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface HybridInstruction {
  readonly action: string;
  readonly distanceMeters: number;
  readonly durationSeconds: number | null;
}

export interface HybridRouteSection {
  readonly polyline: string;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly instructions: readonly HybridInstruction[];
}

export interface HybridRouteResult {
  readonly orderedStopIds: readonly string[];
  readonly sections: readonly HybridRouteSection[];
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly routeHandle: string | null;
}

export interface HybridRoutingAdapterOptions {
  readonly orsApiKey: string;
  readonly hereApiKey: string;
  readonly fetchImpl: typeof fetch;
  readonly timeoutMs?: number;
}

/**
 * The only owner of the ORS -> HERE provider seam.
 *
 * Both paid-service keys remain in Supabase. ORS decides stop order; HERE only
 * receives already ordered vias and never receives an optimization request.
 * The caller sees our neutral contract, not either provider's response shape.
 */
export function createHybridRoutingAdapter(options: HybridRoutingAdapterOptions) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const request = async (url: URL, init: RequestInit, provider: string): Promise<unknown> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await options.fetchImpl(url.toString(), {
        ...init,
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          throw new ApiError(
            'UPSTREAM_UNAVAILABLE',
            'The routing service is temporarily unavailable',
            { degradationHint: 'RETRY_LATER' },
          );
        }
        throw new ApiError('INTERNAL', 'Something went wrong on our side', {
          details: { provider, upstreamStatus: response.status },
        });
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) {
        throw new ApiError('UPSTREAM_TIMEOUT', 'The routing service took too long', {
          degradationHint: 'RETRY_LATER',
        });
      }
      throw new ApiError('UPSTREAM_UNAVAILABLE', 'Could not reach the routing service', {
        degradationHint: 'RETRY_LATER',
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  const optimize = async (stops: readonly HybridStop[]): Promise<HybridRouteResult> => {
    validateStops(stops);

    const jobs = stops.slice(1, -1).map((stop, index) => ({
      id: index + 1,
      location: [stop.longitude, stop.latitude],
    }));

    const optimization = await request(
      new URL(ORS_ENDPOINT),
      {
        method: 'POST',
        headers: {
          authorization: options.orsApiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          jobs,
          vehicles: [
            {
              id: 1,
              profile: 'driving-car',
              start: coordinatePair(stops[0]),
              end: coordinatePair(stops[stops.length - 1]),
            },
          ],
        }),
      },
      'ors',
    );

    const orderedStops = parseOptimization(optimization, stops);
    const url = new URL(HERE_ENDPOINT);
    url.searchParams.set('transportMode', 'car');
    url.searchParams.set('routingMode', 'fast');
    url.searchParams.set('return', 'polyline,summary,turnByTurnActions,routeHandle');
    url.searchParams.set('origin', routePoint(orderedStops[0]));
    url.searchParams.set('destination', routePoint(orderedStops[orderedStops.length - 1]));
    for (const stop of orderedStops.slice(1, -1)) {
      url.searchParams.append('via', routePoint(stop));
    }
    url.searchParams.set('apiKey', options.hereApiKey);

    const routing = await request(url, { method: 'GET' }, 'here');
    return parseHereRoute(routing, orderedStops);
  };

  return { optimize };
}

function validateStops(stops: readonly HybridStop[]): void {
  if (stops.length < MIN_ROUTE_POINTS || stops.length > MAX_STOPS) {
    throw new ApiError('INVALID_REQUEST', 'The route contains an unsupported number of stops');
  }
  if (new Set(stops.map((stop) => stop.id)).size !== stops.length) {
    throw new ApiError('INVALID_REQUEST', 'Route stop identifiers must be unique');
  }
}

function coordinatePair(stop: HybridStop | undefined): readonly [number, number] {
  if (stop === undefined) throw malformed('Missing route endpoint');
  return [stop.longitude, stop.latitude];
}

function routePoint(stop: HybridStop | undefined): string {
  if (stop === undefined) throw malformed('Missing route endpoint');
  return stop.latitude + ',' + stop.longitude;
}

function parseOptimization(payload: unknown, stops: readonly HybridStop[]): readonly HybridStop[] {
  if (!isRecord(payload)) throw malformed('ORS returned a malformed response');

  const unassigned = payload.unassigned;
  if (Array.isArray(unassigned) && unassigned.length !== 0) {
    throw malformed('ORS returned unassigned stops');
  }

  const routes = payload.routes;
  if (!Array.isArray(routes) || routes.length !== 1 || !isRecord(routes[0])) {
    throw malformed('ORS returned an unexpected vehicle route');
  }

  const steps = routes[0].steps;
  if (!Array.isArray(steps)) throw malformed('ORS returned no ordered steps');

  const expected = new Map(stops.slice(1, -1).map((stop, index) => [index + 1, stop]));
  const visited = new Set<number>();
  const ordered: HybridStop[] = [];
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (first === undefined || last === undefined) throw malformed('Missing route endpoint');
  ordered.push(first);

  for (const step of steps) {
    if (!isRecord(step) || step.type !== 'job') continue;
    if (typeof step.job !== 'number' || visited.has(step.job)) {
      throw malformed('ORS repeated or returned an invalid stop');
    }
    const stop = expected.get(step.job);
    if (stop === undefined) throw malformed('ORS returned an unknown stop');
    visited.add(step.job);
    ordered.push(stop);
  }

  if (visited.size !== expected.size) throw malformed('ORS omitted one or more stops');
  ordered.push(last);
  return ordered;
}

function parseHereRoute(payload: unknown, orderedStops: readonly HybridStop[]): HybridRouteResult {
  if (!isRecord(payload) || !Array.isArray(payload.routes) || !isRecord(payload.routes[0])) {
    throw malformed('HERE returned no route');
  }

  const route = payload.routes[0];
  if (!Array.isArray(route.sections) || route.sections.length === 0) {
    throw malformed('HERE returned no route sections');
  }

  const sections = route.sections.map(parseSection);
  return {
    orderedStopIds: orderedStops.map((stop) => stop.id),
    sections,
    distanceMeters: sections.reduce((total, section) => total + section.distanceMeters, 0),
    durationSeconds: sections.reduce((total, section) => total + section.durationSeconds, 0),
    routeHandle: typeof route.routeHandle === 'string' ? route.routeHandle : null,
  };
}

function parseSection(value: unknown): HybridRouteSection {
  if (!isRecord(value) || !isRecord(value.summary)) throw malformed('HERE section has no summary');
  if (typeof value.polyline !== 'string' || value.polyline.length === 0) {
    throw malformed('HERE section has no polyline');
  }
  if (typeof value.summary.length !== 'number' || typeof value.summary.duration !== 'number') {
    throw malformed('HERE section has an incomplete summary');
  }

  const instructions: HybridInstruction[] = [];
  if (Array.isArray(value.actions)) {
    for (const action of value.actions) {
      if (!isRecord(action) || typeof action.action !== 'string') continue;
      instructions.push({
        action: action.action,
        distanceMeters: typeof action.length === 'number' ? action.length : 0,
        durationSeconds: typeof action.duration === 'number' ? action.duration : null,
      });
    }
  }

  return {
    polyline: value.polyline,
    distanceMeters: value.summary.length,
    durationSeconds: value.summary.duration,
    instructions,
  };
}

function malformed(reason: string): ApiError {
  return new ApiError('INTERNAL', 'Something went wrong on our side', {
    details: { providerResponse: reason },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
