/**
 * What the user is told after pressing Confirm.
 *
 * **Five of the six outcomes used to produce nothing at all.** The call site
 * read `needs-provider` and dropped the rest on the floor, so a Waze handoff
 * blocked by an expired coordinate, a route past the URL ceiling, a navigation
 * app that is not installed, and a successful hand-off into three chunks all
 * looked identical from the phone: the button was pressed and the screen did
 * not change (`CLAUDE.md` §0 rule 5).
 *
 * Success is here too, and that is the point of the file rather than an
 * afterthought. A route handed over in three chunks is a fact the driver has to
 * know **before** they set off — otherwise they discover it at the end of the
 * first chunk, parked somewhere unexpected with no idea why navigation stopped.
 */

export interface HandoffNotice {
  /** `success` is mint and passing; the rest are warnings that stay until read. */
  readonly kind: 'success' | 'warning';
  readonly title: string;
  readonly detail: string | null;
}

export interface HandoffNoticeInputs {
  readonly kind:
    | 'handed-off'
    | 'needs-provider'
    | 'needs-coordinates'
    | 'route-too-long'
    | 'failed'
    | 'no-route';
  /** How many separate hand-offs the route was split into. Only meaningful for
   *  `handed-off`. */
  readonly chunkCount?: number;
  /** How many stops are missing a coordinate. Only meaningful for
   *  `needs-coordinates`. */
  readonly stopCount?: number;
}

export function handoffNoticeOf(inputs: HandoffNoticeInputs): HandoffNotice | null {
  switch (inputs.kind) {
    case 'needs-provider':
      // The picker opens instead; a notice as well would be two things saying
      // the same thing at once.
      return null;

    case 'handed-off': {
      const chunks = inputs.chunkCount ?? 1;
      if (chunks <= 1) return null;

      return {
        kind: 'success',
        title: `Sent in ${chunks} parts`,
        // Named as an app limit rather than left to look like ours: the ceiling
        // is the destination app's URL length, and the driver can do nothing
        // about it except know.
        detail: `Your navigation app takes a limited number of stops at once. Come back here after each part.`,
      };
    }

    case 'needs-coordinates': {
      const count = inputs.stopCount ?? 0;
      return {
        kind: 'warning',
        title:
          count === 1
            ? 'One stop needs its address refreshed'
            : `${count} stops need their addresses refreshed`,
        // Waze takes coordinates and has no address form, so an expired cache
        // blocks it outright rather than degrading (ADR-0007). Naming the way
        // out matters: another app will take the same route today.
        detail: 'Waze needs exact positions. Choose Google Maps instead, or reconnect to refresh.',
      };
    }

    case 'route-too-long':
      return {
        kind: 'warning',
        title: 'This route is too long to hand over',
        detail: 'Remove a stop, or split the day into two routes.',
      };

    case 'no-route':
      return {
        kind: 'warning',
        title: 'Nothing to hand over yet',
        detail: 'Optimize the route first.',
      };

    case 'failed':
    default:
      return {
        kind: 'warning',
        title: 'Could not open your navigation app',
        // The likeliest cause by far, and the only one the user can act on.
        detail: 'It may not be installed. Choose a different app in Settings.',
      };
  }
}
