import { fireEvent, render, screen } from '@testing-library/react-native';

import { Dock, DOCK_HEIGHT } from './Dock';
import { SectionPanel } from './SectionPanel';
import { dockItems, showsClose } from '@/lib/ui/dock';
import type { DockSection } from '@/lib/ui/dock';

/**
 * The dock, and the panel it must not disappear behind.
 *
 * Two properties carry real consequences. The close control has to exist exactly
 * when there is something to close, and the panel has to stop above the dock —
 * a panel drawn edge to edge covers the control it is meant to be closed by, and
 * leaves the system back gesture as the only way out.
 */

const noop = () => undefined;
const parked = { isRouteInProgress: false };
const driving = { isRouteInProgress: true };

const renderDock = (
  active: DockSection | null,
  conditions = parked,
  overrides: Partial<Parameters<typeof Dock>[0]> = {},
) =>
  render(
    <Dock
      items={dockItems(active, conditions)}
      showsClose={showsClose(active)}
      onSelect={noop}
      onClose={noop}
      theme="light"
      testID="dock"
      {...overrides}
    />,
  );

describe('what the dock shows', () => {
  it('offers every section on the bare map', () => {
    renderDock(null);

    expect(screen.getByTestId('dock-itinerary')).toBeTruthy();
    expect(screen.getByTestId('dock-history')).toBeTruthy();
    expect(screen.getByTestId('dock-settings')).toBeTruthy();
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
    renderDock(null);
    expect(screen.getByLabelText('Open your saved routes')).toBeTruthy();
  });
});

describe('the close control', () => {
  it('is absent on the bare map, where it would answer a tap with nothing', () => {
    renderDock(null);
    expect(screen.queryByTestId('dock-close')).toBeNull();
  });

  it('appears as soon as a section is open', () => {
    renderDock('settings');
    expect(screen.getByTestId('dock-close')).toBeTruthy();
  });

  it('names the destination, not the mechanism', () => {
    renderDock('settings');
    expect(screen.getByLabelText('Close this section and show the map')).toBeTruthy();
  });

  it('reports the close rather than the section', () => {
    const onClose = jest.fn();
    const onSelect = jest.fn();
    renderDock('settings', parked, { onClose, onSelect });

    fireEvent.press(screen.getByTestId('dock-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('choosing a section', () => {
  it('reports which one was tapped', () => {
    const onSelect = jest.fn();
    renderDock(null, parked, { onSelect });

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

    expect(screen.getByTestId('panel').props.style.bottom).toBe(DOCK_HEIGHT);
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
