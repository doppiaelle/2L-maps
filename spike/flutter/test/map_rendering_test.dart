import 'package:flutter_test/flutter_test.dart';
import '../lib/map_rendering.dart';

void main() {
  test('mint clay theme exposes approved visual tokens', () {
    expect(MapTheme.mintClay.routeColor, 0xFF00F5D4);
    expect(MapTheme.mintClay.pitch, 48);
  });

  test('overlay carries polyline and custom markers', () {
    const overlay = RouteOverlay(
      polyline: 'encoded',
      markers: [MapMarker(id: 'stop-1', latitude: 45, longitude: 9, color: 0xFF00F5D4)],
    );
    expect(overlay.markers.single.id, 'stop-1');
  });
}
