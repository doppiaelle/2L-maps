import { fireEvent, render, screen } from '@testing-library/react-native';

import { RouteEndpointControls } from './RouteEndpointControls';

describe('route endpoint controls', () => {
  it('offers the two supported starting points', () => {
    const onChooseStart = jest.fn();
    render(
      <RouteEndpointControls
        start="first-stop"
        end="last-stop"
        locationState="available"
        onChooseStart={onChooseStart}
        onChooseEnd={jest.fn()}
        onReset={jest.fn()}
        theme="light"
      />,
    );

    fireEvent.press(screen.getByTestId('route-start-choice'));
    expect(screen.getByTestId('route-start-first-stop')).toBeTruthy();
    fireEvent.press(screen.getByTestId('route-start-current-location'));

    expect(onChooseStart).toHaveBeenCalledWith('current-location');
  });

  it('offers every supported finish without adding a visible fake stop', () => {
    const onChooseEnd = jest.fn();
    render(
      <RouteEndpointControls
        start="first-stop"
        end="last-stop"
        locationState="ready"
        onChooseStart={jest.fn()}
        onChooseEnd={onChooseEnd}
        onReset={jest.fn()}
        theme="dark"
      />,
    );

    fireEvent.press(screen.getByTestId('route-end-choice'));
    expect(screen.getByTestId('route-end-last-stop')).toBeTruthy();
    expect(screen.getByTestId('route-end-return-to-start')).toBeTruthy();
    fireEvent.press(screen.getByTestId('route-end-current-location'));

    expect(onChooseEnd).toHaveBeenCalledWith('current-location');
  });

  it('keeps reset separate and explicit', () => {
    const onReset = jest.fn();
    render(
      <RouteEndpointControls
        start="first-stop"
        end="last-stop"
        locationState="available"
        onChooseStart={jest.fn()}
        onChooseEnd={jest.fn()}
        onReset={onReset}
        theme="light"
      />,
    );

    fireEvent.press(screen.getByTestId('route-reset'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('states when a selected device origin is not ready yet', () => {
    render(
      <RouteEndpointControls
        start="current-location"
        end="last-stop"
        locationState="locating"
        onChooseStart={jest.fn()}
        onChooseEnd={jest.fn()}
        onReset={jest.fn()}
        theme="light"
      />,
    );

    expect(screen.getByText('Locating…')).toBeTruthy();
    expect(screen.getByText('A precise location is required before optimization.')).toBeTruthy();
  });
});
