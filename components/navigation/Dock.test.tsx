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
  it('offers every section on the bare map', () => {
    renderDock('map');

    expect(screen.getByTestId('dock-map')).toBeTruthy();
    expect(screen.getByTestId('dock-itinerary')).toBeTruthy();
    expect(screen.getByTestId('dock-history')).toBeTruthy();
    expect(screen.getByTestId('dock-settings')).toBeTruthy();
  });

  it('shows the same four items whatever is open', () => {
    // The property the close control broke: the row's width is a constant, so an
    // item is where the user last saw it (ADR-0020).
    const sections: DockSection[] = ['map', 'itinerary', 'history', 'settings'];

    for (const active of sections) {
      const { unmount } = renderDock(active);
      expect(screen.getAllByRole('tab')).toHaveLength(4);
      unmount();
    }
  });

  it('marks the map as the selected section when nothing is open', () => {
    renderDock('map');
    expect(screen.getByTestId('dock-map').props.accessibilityState.selected).toBe(true);
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
    renderDock('map');
    expect(screen.getByLabelText('Open your saved routes')).toBeTruthy();
  });
});

describe('leaving a section', () => {
  it('has no close control to appear and disappear', () => {
    renderDock('settings');
    expect(screen.queryByTestId('dock-close')).toBeNull();
  });

  it('offers the map as a destination instead', () => {
    renderDock('settings');
    expect(screen.getByLabelText('Show the map')).toBeTruthy();
  });

  it('sends the open section back to the map when it is tapped again', () => {
    expect(toggleSection('settings', 'settings')).toBe('map');
  });

  it('leaves the map where it is when the map is tapped', () => {
    // Pressing the section you are already in confirms where you are; it is not
    // a request to go somewhere else.
    expect(toggleSection('map', 'map')).toBe('map');
  });
});

describe('choosing a section', () => {
  it('reports which one was tapped', () => {
    const onSelect = jest.fn();
    renderDock('map', parked, { onSelect });

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
