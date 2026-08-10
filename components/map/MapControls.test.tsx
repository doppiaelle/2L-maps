import { fireEvent, render, screen } from '@testing-library/react-native';

import { MapControls } from './MapControls';

/**
 * These two controls are how History and Settings are reached at all.
 *
 * Both screens existed, were tested, and were unreachable: the only navigation
 * anywhere in the app was add-stop opening import. A whole destination — and
 * the sign-out inside it — shipped without ever being openable, which is the
 * kind of gap no unit test finds because every unit was correct.
 */

const noop = () => undefined;

const renderControls = (props: Partial<Parameters<typeof MapControls>[0]> = {}) =>
  render(
    <MapControls
      onOpenHistory={noop}
      onOpenSettings={noop}
      isRouteInProgress={false}
      theme="light"
      {...props}
    />,
  );

describe('reaching the other two destinations', () => {
  it('offers both', () => {
    renderControls();
    expect(screen.getByTestId('map-control-history')).toBeTruthy();
    expect(screen.getByTestId('map-control-settings')).toBeTruthy();
  });

  it('opens History', () => {
    let opened = false;
    renderControls({
      onOpenHistory: () => {
        opened = true;
      },
    });

    fireEvent.press(screen.getByTestId('map-control-history'));
    expect(opened).toBe(true);
  });

  it('opens Settings, which is where sign-out lives', () => {
    let opened = false;
    renderControls({
      onOpenSettings: () => {
        opened = true;
      },
    });

    fireEvent.press(screen.getByTestId('map-control-settings'));
    expect(opened).toBe(true);
  });
});

describe('while a route is underway', () => {
  it('shows neither', () => {
    // Settings is never reachable mid-drive (docs/05 §194) and the reason
    // covers both: the user is driving, and a control that navigates away from
    // the route they are following should not be under their thumb.
    expect(renderControls({ isRouteInProgress: true }).toJSON()).toBeNull();
  });
});

describe('being usable', () => {
  it('names what each does rather than what it is', () => {
    // A glyph announces as nothing at all to a screen reader
    // (`CLAUDE.md` §10 rule 1).
    renderControls();
    expect(screen.getByTestId('map-control-history').props.accessibilityLabel).toBe(
      'Open your saved routes',
    );
  });

  it('keeps a 44 pt hit area even though the glyph is smaller', () => {
    // A map control that is hard to hit is a map that gets panned by accident.
    renderControls();
    const style = screen.getByTestId('map-control-settings').props.style as {
      width: number;
      height: number;
    };
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.height).toBeGreaterThanOrEqual(44);
  });
});
