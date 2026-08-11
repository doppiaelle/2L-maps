import { fireEvent, render, screen } from '@testing-library/react-native';

import { Dock, DOCK_OUTER_HEIGHT } from './Dock';
import { SectionPanel } from './SectionPanel';
import { dockItems, toggleSection } from '@/lib/ui/dock';
import type { DockSection } from '@/lib/ui/dock';

/**
 * The dock, and the panel it must not disappear behind.
 *
 * Two properties carry real consequences. **The row must never change width** —
 * an item that moves under the thumb between one tap and the next is an item
 * nobody learns, and the close control that used to appear and disappear did
 * exactly that (ADR-0020). And the panel has to stop above the dock: a panel
 * drawn edge to edge covers the navigation it is meant to be left by, and leaves
 * the system back gesture as the only way out.
 */

const noop = () => undefined;
const parked = { isRouteInProgress: false };
const driving = { isRouteInProgress: true };

const renderDock = (
  active: DockSection,
  conditions = parked,
  overrides: Partial<Parameters<typeof Dock>[0]> = {},
) =>
  render(
    <Dock
      items={dockItems(active, conditions)}
      onSelect={noop}
      theme="light"
      testID="dock"
      {...overrides}
    />,
  );

describe('what the dock shows', () => {
  it('offers every section', () => {
    renderDock('itinerary');

    expect(screen.getByTestId('dock-itinerary')).toBeTruthy();
    expect(screen.getByTestId('dock-history')).toBeTruthy();
    expect(screen.getByTestId('dock-settings')).toBeTruthy();
  });

  it('has no Map item, because the map is not a destination', () => {
    // It is what an optimization produces, shown inside Route (ADR-0022).
    renderDock('itinerary');
    expect(screen.queryByTestId('dock-map')).toBeNull();
  });

  it('shows the same three items whatever is open', () => {
    // The property the close control broke: the row's width is a constant, so an
    // item is where the user last saw it (ADR-0020).
    const sections: DockSection[] = ['itinerary', 'history', 'settings'];

    for (const active of sections) {
      const { unmount } = renderDock(active);
      expect(screen.getAllByRole('tab')).toHaveLength(3);
      unmount();
    }
  });

  it('keeps History and Settings reachable while a route is in progress', () => {
    // The controls this replaces returned null mid-route, so the driver was the
    // one person who could reach neither (ADR-0018).
    renderDock('itinerary', driving);

    expect(screen.getByTestId('dock-history')).toBeTruthy();
    expect(screen.getByTestId('dock-settings')).toBeTruthy();
  });

  it('announces which section is open, not only by colour', () => {
    renderDock('history');

    expect(screen.getByTestId('dock-history').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('dock-settings').props.accessibilityState.selected).toBe(false);
  });

  it('says what each item does rather than what it is', () => {
    renderDock('itinerary');
    expect(screen.getByLabelText('Open your saved routes')).toBeTruthy();
  });
});

describe('leaving a section', () => {
  it('has no close control to appear and disappear', () => {
    renderDock('settings');
    expect(screen.queryByTestId('dock-close')).toBeNull();
  });

  it('does not eject you from the section you are in', () => {
    // The way back out of a drawn route is the X on the map itself, which
    // returns to the list within the section (`lib/route/route-view.ts`).
    expect(toggleSection('settings', 'settings')).toBe('settings');
  });
});

describe('choosing a section', () => {
  it('reports which one was tapped', () => {
    const onSelect = jest.fn();
    renderDock('itinerary', parked, { onSelect });

    fireEvent.press(screen.getByTestId('dock-history'));
    expect(onSelect).toHaveBeenCalledWith('history');
  });
});

describe('the panel over the map', () => {
  it('stops above the dock rather than covering it', () => {
    // Edge to edge would hide the close control behind the thing it closes.
    render(
      <SectionPanel theme="light" testID="panel">
        {null}
      </SectionPanel>,
    );

    expect(screen.getByTestId('panel').props.style.bottom).toBe(DOCK_OUTER_HEIGHT);
  });

  it('takes the screen reader off the map behind it', () => {
    render(
      <SectionPanel theme="light" testID="panel">
        {null}
      </SectionPanel>,
    );

    expect(screen.getByTestId('panel').props.accessibilityViewIsModal).toBe(true);
  });
});

/**
 * The edges of the device, which the panel had no idea about.
 *
 * Both of these were reported from a phone rather than found in review, and both
 * are the kind of defect a simulator at default settings hides: the section
 * began under the status bar, and below the dock the window's own colour showed
 * through as a white band across the bottom of a dark screen.
 */
describe('the section panel and the device', () => {
  it('starts below the status bar, not under it', () => {
    render(
      <SectionPanel theme="light" topInset={48} testID="panel">
        {null}
      </SectionPanel>,
    );
    // The inset plus the product's own margin, never one or the other.
    expect(screen.getByTestId('panel').props.style.paddingTop).toBeGreaterThan(48);
  });

  it('stops above the dock for a list, whose last row must be reachable', () => {
    render(
      <SectionPanel theme="light" testID="panel">
        {null}
      </SectionPanel>,
    );
    expect(screen.getByTestId('panel').props.style.bottom).toBe(DOCK_OUTER_HEIGHT);
  });

  it('runs the whole height for a surface, so the map passes under the dock', () => {
    // Stopping the drawing short leaves a band of background between the map and
    // the dock, and the map reads as a panel rather than as the ground
    // (ADR-0022).
    render(
      <SectionPanel theme="light" extendsBehindDock testID="panel">
        {null}
      </SectionPanel>,
    );
    expect(screen.getByTestId('panel').props.style.bottom).toBe(0);
  });
});
