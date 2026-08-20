import 'package:flutter_test/flutter_test.dart';
import '../lib/here_route_parser.dart';

void main() {
  test('parses summary, polyline and turn actions', () {
    final result = const HereRouteParser().parse({
      'routes': [{
        'sections': [{
          'summary': {'length': 1234, 'duration': 456},
          'polyline': 'BFoz5xJ67i1B1B1B1B1B',
          'actions': [
            {'action': 'depart', 'length': 10, 'duration': 4},
            {'action': 'turn', 'length': 100, 'duration': 30},
          ],
        }],
      }],
    });
    expect(result.distanceMeters, 1234);
    expect(result.durationSeconds, 456);
    expect(result.instructions, hasLength(2));
    expect(result.instructions.last.action, 'turn');
  });

  test('rejects incomplete HERE response', () {
    expect(
      () => const HereRouteParser().parse({'routes': []}),
      throwsFormatException,
    );
  });
}
