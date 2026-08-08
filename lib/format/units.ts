/**
 * Distance and duration formatting.
 *
 * Two rules from docs/34_LOCALIZATION.md §7 drive everything here.
 *
 * **Units follow the locale, never the language.** An English-speaking user in
 * Italy is driving on roads signed in kilometres, and showing them miles because
 * the interface is in English would be actively unhelpful.
 *
 * **Formatting goes through `Intl`, never manual string assembly.** Italian
 * decimal commas, thousands separators and 24-hour clocks are all handled
 * correctly there; hand-rolled formatting gets them wrong in ways that read as
 * defects to a native speaker rather than as a rounding choice.
 */

const METERS_PER_MILE = 1609.344;
const METERS_PER_FOOT = 0.3048;

/** Locales that use miles for road distance. Everything else is metric — the
 *  imperial set is small and closed, so listing it is honest and listing the
 *  metric world would not be. */
const IMPERIAL_REGIONS = new Set(['US', 'GB', 'LR', 'MM']);

/**
 * Whether a locale uses imperial road distances.
 *
 * The UK is a genuine special case: it is metric for almost everything and
 * imperial for road signs, so a user in London expects miles even though they buy
 * petrol in litres.
 */
export function usesImperial(locale: string): boolean {
  const region = regionOf(locale);
  return region !== null && IMPERIAL_REGIONS.has(region);
}

function regionOf(locale: string): string | null {
  try {
    const resolved = new Intl.Locale(locale);
    return resolved.region ?? null;
  } catch {
    // An unparseable locale tag falls through to metric, which is the correct
    // default for the launch market and the larger share of the world.
    return null;
  }
}

/**
 * Format a road distance.
 *
 * Rounds to the nearest 10 m below a kilometre and to one decimal place above.
 * `34,237 km` is false precision on a road route — the underlying figure is not
 * accurate to the metre — and it reads as unconsidered.
 */
export function formatDistance(meters: number, locale: string): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';

  if (usesImperial(locale)) {
    const feet = meters / METERS_PER_FOOT;
    if (feet < 1000) {
      return `${formatNumber(Math.round(feet / 10) * 10, locale, 0)} ft`;
    }
    return `${formatNumber(meters / METERS_PER_MILE, locale, 1)} mi`;
  }

  if (meters < 1000) {
    return `${formatNumber(Math.round(meters / 10) * 10, locale, 0)} m`;
  }
  return `${formatNumber(meters / 1000, locale, 1)} km`;
}

function formatNumber(value: number, locale: string, decimals: number): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a travel duration.
 *
 * Seconds are never shown. A route ETA accurate to the second is a claim the
 * traffic model cannot support, and the user reading it at a glance while driving
 * cannot use it either.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';

  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}min`;
}

/**
 * Format a clock time.
 *
 * The hour cycle follows the locale: 24-hour in Italy, 12-hour in the US. Getting
 * this wrong makes an ETA ambiguous by twelve hours, which is worse than showing
 * no ETA at all.
 */
export function formatTime(date: Date, locale: string, timeZone?: string): string {
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(date);
}

/**
 * The arrival time implied by a duration.
 *
 * `departure` comes from the server, never the device: a device with a wrong
 * clock would otherwise produce a confidently wrong arrival time
 * (docs/15_ROUTE_OPTIMIZATION.md §ETA).
 */
export function arrivalTime(departure: Date, durationSeconds: number): Date {
  return new Date(departure.getTime() + durationSeconds * 1000);
}
