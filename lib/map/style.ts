import { colours, mapColours, ROUTE_DASH_PATTERN, stroke } from '@/lib/design/tokens';
import type { ThemeName } from '@/lib/design/tokens';
import type { StopProgressState } from '@/lib/route/progress';

/**
 * How the route line is drawn.
 *
 * The casing is a second, wider line drawn underneath rather than an outline:
 * the SDK has no outline on a polyline, and the width difference is what
 * produces the 1 pt border the design document specifies. It exists in light
 * theme only — mint on paper-white is this system's weakest contrast pairing,
 * and the casing is also what keeps the route readable over the red-orange
 * traffic layer (docs/07_DESIGN_SYSTEM.md §Map-specific).
 */
export interface RouteStroke {
  readonly colour: string;
  readonly width: number;
  readonly casing: { readonly colour: string; readonly width: number } | null;
  /** Null for a solid line. Present only for a degraded route, where the dash is
   *  the signal that no road routing happened. */
  readonly dashPattern: readonly number[] | null;
}

export function routeStroke(theme: ThemeName, isDegraded: boolean): RouteStroke {
  const palette = colours[theme];

  if (isDegraded) {
    // `warning`, never `danger`: a degraded result is a lower-confidence answer,
    // not an error, and red would misrepresent it (docs/07_DESIGN_SYSTEM.md).
    // No casing — the dash is already carrying the distinction, and a casing on
    // a dashed line reads as noise rather than as emphasis.
    return {
      colour: palette.warning,
      width: stroke.routeDegraded,
      casing: null,
      dashPattern: [...ROUTE_DASH_PATTERN],
    };
  }

  const casingColour = mapColours[theme].routeCasing;
  return {
    colour: palette.accent,
    width: stroke.route,
    casing: casingColour === null ? null : { colour: casingColour, width: stroke.routeCasing },
    dashPattern: null,
  };
}

/**
 * How one marker is drawn.
 *
 * Never colour alone (`CLAUDE.md` §10 rule 4): every state carries a glyph or a
 * shape difference as well as a fill, so the map is readable with deuteranopia.
 * Pairing the two here — rather than in the component — is what stops one of
 * them being updated without the other.
 */
export interface MarkerStyle {
  readonly fill: string;
  readonly border: string;
  readonly foreground: string;
  /** Replaces the ordinal when present. An unreachable stop shows a warning
   *  glyph rather than its number, because its number promises an order the
   *  route cannot actually be driven in. */
  readonly glyph: string | null;
  /** The word a screen reader would use, kept beside the appearance it belongs
   *  to. The map itself is one accessibility element, but a stop's state is also
   *  spoken in the list, and the two must not drift apart. */
  readonly spoken: string;
}

/**
 * Two states, down from four.
 *
 * `completed` and `skipped` were the driver's own marks, and there is no longer
 * anywhere to make one: the drive happens inside a navigation app
 * ([ADR-0027](../../docs/adr/0027-the-drive-happens-elsewhere.md)). What is left
 * is the optimizer's own report — this stop has no road to it — which is the one
 * marker state the user cannot cause and cannot clear.
 */
export type MarkerState = StopProgressState;

export function markerStyle(
  theme: ThemeName,
  state: MarkerState,
  isSelected: boolean,
): MarkerStyle {
  const palette = colours[theme];

  // Selection wins over state for the fill, because selection is what the user
  // just did and the map has to answer that first. The glyph is kept, so a
  // selected unreachable stop still shows its warning.
  const base: Record<MarkerState, MarkerStyle> = {
    pending: {
      fill: palette.surface,
      border: palette.textPrimary,
      foreground: palette.textPrimary,
      glyph: null,
      spoken: 'stop',
    },
    unreachable: {
      fill: palette.surface,
      border: palette.danger,
      foreground: palette.danger,
      glyph: '!',
      spoken: 'unreachable',
    },
  };

  const style = base[state];
  if (!isSelected) return style;

  return {
    ...style,
    fill: palette.accent,
    border: palette.accent,
    foreground: palette.accentOn,
    spoken: `${style.spoken}, selected`,
  };
}

/** Selected markers are enlarged and raised (docs/14 §7). The hit area does not
 *  change with them — it is 44 pt at every size (`CLAUDE.md` §10 rule 2). */
export const MARKER_SIZE = 32;
export const MARKER_SIZE_SELECTED = 40;
