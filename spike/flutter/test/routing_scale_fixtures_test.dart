import 'package:flutter_test/flutter_test.dart';
import '../lib/routing_fixtures.dart';

void main() {
  for (final count in [5, 15, 25]) {
    test('fixture supports $count stops', () {
      final stops = makeStops(count);
      expect(stops, hasLength(count));
      expect(stops.first.id, 'start');
      expect(stops.last.id, 'end');
    });
  }

  test('fixture rejects unsupported sizes', () {
    expect(() => makeStops(2), throwsArgumentError);
    expect(() => makeStops(26), throwsArgumentError);
  });
}
