import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { AD_SLOT_HEIGHT, AdSlot } from './AdSlot';
import { StopRow } from './StopRow';
import type { StopState } from './StopRow';
import { fallbackAllowances } from '@/lib/entitlement/plans';
import { layout } from '@/lib/design/tokens';
import type { AdsProvider } from '@/lib/providers/types';

const noop = () => undefined;

// ─── StopRow ─────────────────────────────────────────────────────────────────

const renderRow = (overrides: Partial<React.ComponentProps<typeof StopRow>> = {}) =>
  render(
    <StopRow
      position={3}
      address="Via Roma 12, Bergamo"
      label={null}
      state="pending"
      hasCoordinate
      meta={null}
      onPress={noop}
      {...overrides}
    />,
  );

/**
 * These query with `includeHiddenElements` on purpose. The glyphs and the
 * ordinal badge are deliberately hidden from assistive technology — their
 * meaning is already in the row's accessibility label, and announcing a "✓"
 * after the word "completed" is noise. But they must still be *drawn*, because
 * that is the whole point of not relying on colour. So the assertion is about
 * what is on screen, and it has to say so.
 */
describe('a stop is never distinguished by colour alone', () => {
  it('shows a checkmark as well as mint when completed', () => {
    // A user with deuteranopia must be able to work this list, and colour-only
    // state is the commonest way a list stops being usable for them
    // (CLAUDE.md §10 rule 4).
    renderRow({ state: 'completed' });
    expect(screen.getByText('✓', { includeHiddenElements: true })).toBeTruthy();
  });

  it('shows a glyph as well as red when unreachable', () => {
    renderRow({ state: 'unreachable' });
    expect(screen.getByText('!', { includeHiddenElements: true })).toBeTruthy();
  });

  it('shows a glyph for a skipped stop too', () => {
    renderRow({ state: 'skipped' });
    expect(screen.getByText('→', { includeHiddenElements: true })).toBeTruthy();
  });

  it('shows no glyph for the ordinary case, so the ones that appear mean something', () => {
    renderRow({ state: 'pending' });
    expect(screen.queryByText('✓', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText('!', { includeHiddenElements: true })).toBeNull();
  });
});

describe('what a screen reader hears', () => {
  const cases: readonly [StopState, string][] = [
    ['pending', 'not yet visited'],
    ['completed', 'completed'],
    ['skipped', 'skipped'],
    ['unreachable', 'unreachable'],
  ];

  it.each(cases)('says the state for %s', (state, spoken) => {
    renderRow({ state });
    expect(screen.getByRole('button').props.accessibilityLabel).toContain(spoken);
  });

  it('carries the position and the title in one utterance', () => {
    // A screen reader user should not have to explore the row to learn either.
    renderRow({ position: 7, label: 'Warehouse' });
    expect(screen.getByRole('button').props.accessibilityLabel).toBe(
      'Stop 7, Warehouse, not yet visited',
    );
  });

  it('does not read the ordinal badge twice', () => {
    // It is already in the label; announcing the decoration as well is noise.
    renderRow();
    expect(
      screen.getByTestId('stop-ordinal', { includeHiddenElements: true }).props
        .accessibilityElementsHidden,
    ).toBe(true);
  });
});

describe('an expired coordinate is shown, not hidden', () => {
  it('warns on the row itself', () => {
    // Coordinates expire at 30 days by design. Hiding it leaves the user to
    // discover it when Waze refuses the handoff — in the van, mid-route.
    renderRow({ hasCoordinate: false });
    expect(screen.getByText('Address needs refreshing')).toBeTruthy();
  });

  it('tells a screen reader what it means for navigating', () => {
    renderRow({ hasCoordinate: false });
    expect(screen.getByRole('button').props.accessibilityHint).toContain('re-entered');
  });

  it('says nothing when the coordinate is fresh', () => {
    renderRow({ hasCoordinate: true });
    expect(screen.queryByText('Address needs refreshing')).toBeNull();
  });
});

describe('the row as a control', () => {
  it('meets the touch minimum', () => {
    renderRow();
    expect(screen.getByRole('button').props.style).toMatchObject({ minHeight: layout.touchMin });
  });

  it('shows the address under a user-authored label rather than replacing it', () => {
    renderRow({ label: 'Warehouse' });
    expect(screen.getByText('Warehouse')).toBeTruthy();
    expect(screen.getByText('Via Roma 12, Bergamo')).toBeTruthy();
  });

  it('reports a tap', () => {
    let taps = 0;
    renderRow({
      onPress: () => {
        taps += 1;
      },
    });
    fireEvent.press(screen.getByRole('button'));
    expect(taps).toBe(1);
  });
});

// ─── AdSlot ──────────────────────────────────────────────────────────────────

const adsStub = (banner: { height: number } | null): AdsProvider & { requests: string[] } => {
  const requests: string[] = [];
  return {
    requests,
    consent: async () => 'personalised',
    requestConsent: async () => 'personalised',
    loadBanner: async (slot) => {
      requests.push(slot);
      return banner;
    },
    showRewarded: async () => 'watched',
  };
};

const renderSlot = async (
  overrides: Partial<React.ComponentProps<typeof AdSlot>> = {},
  ads = adsStub({ height: 50 }),
) => {
  const utils = render(
    <AdSlot
      slot="stop-list"
      allowances={fallbackAllowances('free')}
      isRouteInProgress={false}
      ads={ads}
      testID="ad-slot"
      {...overrides}
    />,
  );
  // Let the load promise settle before asserting.
  await act(async () => undefined);
  return { ...utils, ads };
};

describe('no ad appears during a route', () => {
  it('renders nothing, and does not even ask', async () => {
    // Safety before commerce: the user is driving (CLAUDE.md §7 rule 8). The
    // component checks rather than assuming the screen did.
    const { ads } = await renderSlot({ isRouteInProgress: true });

    expect(screen.queryByTestId('ad-slot')).toBeNull();
    expect(ads.requests).toHaveLength(0);
  });
});

describe('a subscriber gets no slot at all', () => {
  it.each(['pro', 'day-pass'] as const)('%s sees nothing, not an empty space', async (plan) => {
    // Reserving space for something that can never appear is a gap they paid
    // to remove.
    const { ads } = await renderSlot({ allowances: fallbackAllowances(plan) });

    expect(screen.queryByTestId('ad-slot')).toBeNull();
    expect(ads.requests).toHaveLength(0);
  });
});

describe('the space is reserved whether or not an ad fills it', () => {
  it('keeps the same height when nothing fills', async () => {
    // A banner that pops in and reflows the list moves the row under a thumb
    // already travelling towards it — a mis-tap on somebody's delivery.
    await renderSlot({}, adsStub(null));

    expect(
      screen.getByTestId('ad-slot', { includeHiddenElements: true }).props.style,
    ).toMatchObject({ height: AD_SLOT_HEIGHT });
    expect(screen.queryByText('Advertisement', { includeHiddenElements: true })).toBeNull();
  });

  it('keeps the same height when one does', async () => {
    await renderSlot({}, adsStub({ height: 50 }));

    expect(screen.getByTestId('ad-slot').props.style).toMatchObject({ height: AD_SLOT_HEIGHT });
    expect(screen.getByText('Advertisement')).toBeTruthy();
  });
});

describe('an empty slot is layout, not content', () => {
  it('is hidden from assistive technology until something is there', async () => {
    await renderSlot({}, adsStub(null));
    expect(
      screen.getByTestId('ad-slot', { includeHiddenElements: true }).props
        .accessibilityElementsHidden,
    ).toBe(true);
  });

  it('is announced once it fills', async () => {
    await renderSlot({}, adsStub({ height: 50 }));
    expect(screen.getByTestId('ad-slot').props.accessibilityElementsHidden).toBe(false);
  });
});

describe('a stop whose address has been purged', () => {
  // `formatted_address` is Google-derived and is purged on the same 30-day rule
  // as the coordinates (docs/12_DATABASE.md), so an old saved route arrives
  // holding only a `place_id` and whatever the user called it.

  it('is carried by the user’s own label, which never expires', () => {
    render(
      <StopRow
        position={1}
        address={null}
        label="Warehouse"
        state="pending"
        hasCoordinate={false}
        meta={null}
        onPress={() => undefined}
      />,
    );

    expect(screen.getByText('Warehouse')).toBeTruthy();
  });

  it('says so plainly when there is no label either', () => {
    // An empty line reads as a bug in the list rather than as a stop that needs
    // re-resolving.
    render(
      <StopRow
        position={1}
        address={null}
        label={null}
        state="pending"
        hasCoordinate={false}
        meta={null}
        onPress={() => undefined}
      />,
    );

    expect(screen.getAllByText('Address needs refreshing').length).toBeGreaterThan(0);
  });
});
