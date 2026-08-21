import 'package:flutter_test/flutter_test.dart';

import '../lib/here_route_parser.dart';

void main() {
  test('parses summary, polyline and turn actions', () {
    final result = const HereRouteParser().parse({
      'routes': [
        {
          'sections': [
            {
              'summary': {'length': 1234, 'duration': 456},
              'polyline': 'BFoz5xJ67i1B1B1B1B1B',
              'actions': [
                {'action': 'depart', 'length': 10, 'duration': 4},
                {'action': 'turn', 'length': 100, 'duration': 30},
              ],
            },
          ],
        },
      ],
    });

    expect(result.distanceMeters, 1234);
    expect(result.durationSeconds, 456);
    expect(result.instructions, hasLength(2));
    expect(result.instructions.last.action, 'turn');
  });

  test('aggregates every route section instead of dropping later stops', () {
    final result = const HereRouteParser().parse({
      'routes': [
        {
          'routeHandle': 'saved-handle',
          'sections': [
            {
              'summary': {'length': 1200, 'duration': 300},
              'polyline': 'first-section',
              'actions': [
                {'action': 'depart', 'length': 20},
              ],
            },
            {
              'summary': {'length': 800, 'duration': 240},
              'polyline': 'second-section',
              'actions': [
                {'action': 'turn', 'length': 40},
              ],
            },
          ],
        },
      ],
    });

    expect(result.distanceMeters, 2000);
    expect(result.durationSeconds, 540);
    expect(result.sectionPolylines, ['first-section', 'second-section']);
    expect(result.instructions.map((action) => action.action), ['depart', 'turn']);
    expect(result.routeHandle, 'saved-handle');
  });

  test('rejects incomplete HERE response', () {
    expect(
      () => const HereRouteParser().parse({'routes': []}),
      throwsFormatException,
    );
  });

  test('rejects an incomplete later section', () {
    expect(
      () => const HereRouteParser().parse({
        'routes': [
          {
            'sections': [
              {
                'summary': {'length': 100, 'duration': 20},
                'polyline': 'first',
              },
              {
                'summary': {'length': 200, 'duration': 30},
              },
            ],
          },
        ],
      }),
      throwsFormatException,
    );
  });
}
