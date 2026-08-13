import {
  endLabel,
  normalizeEndpointChoice,
  reorderableCount,
  shapeForRouteEnd,
  startLabel,
  stopsForEndpointChoice,
} from './route-ends';

describe('route endpoint preferences', () => {
  it('defaults to a one-way route from the first to the last entered stop', () => {
    expect(shapeForRouteEnd('last-stop')).toBe('one-way');
    expect(startLabel('first-stop')).toBe('First stop');
    expect(endLabel('last-stop')).toBe('Last stop');
  });

  it('uses a round trip for either return option', () => {
    expect(shapeForRouteEnd('return-to-start')).toBe('round-trip');
    expect(shapeForRouteEnd('current-location')).toBe('round-trip');
  });

  it('makes return to current location a closed loop around current location', () => {
    expect(
      normalizeEndpointChoice({ start: 'first-stop', end: 'current-location' }, 'end'),
    ).toEqual({ start: 'current-location', end: 'current-location' });
  });

  it('keeps the geometry honest when the start changes away from current location', () => {
    expect(
      normalizeEndpointChoice({ start: 'first-stop', end: 'current-location' }, 'start'),
    ).toEqual({ start: 'first-stop', end: 'return-to-start' });
  });

  it('reports exactly the stops the backend can reorder', () => {
    expect(reorderableCount({ stopCount: 4, start: 'first-stop', end: 'last-stop' })).toBe(2);
    expect(reorderableCount({ stopCount: 4, start: 'first-stop', end: 'return-to-start' })).toBe(3);
    expect(reorderableCount({ stopCount: 4, start: 'current-location', end: 'last-stop' })).toBe(3);
    expect(
      reorderableCount({ stopCount: 4, start: 'current-location', end: 'current-location' }),
    ).toBe(4);
  });

  it('restores the entered first and last stops before a one-way optimization', () => {
    const optimizedOrder = [
      { id: 'third', entryOrder: 2 },
      { id: 'first', entryOrder: 0 },
      { id: 'last', entryOrder: 3 },
      { id: 'second', entryOrder: 1 },
    ];

    expect(
      stopsForEndpointChoice(optimizedOrder, { start: 'first-stop', end: 'last-stop' }).map(
        (stop) => stop.id,
      ),
    ).toEqual(['first', 'third', 'second', 'last']);
  });

  it('does not pin an end stop for a round trip', () => {
    const currentOrder = [
      { id: 'last', entryOrder: 2 },
      { id: 'first', entryOrder: 0 },
      { id: 'middle', entryOrder: 1 },
    ];

    expect(
      stopsForEndpointChoice(currentOrder, {
        start: 'current-location',
        end: 'current-location',
      }).map((stop) => stop.id),
    ).toEqual(['last', 'first', 'middle']);
  });
});
