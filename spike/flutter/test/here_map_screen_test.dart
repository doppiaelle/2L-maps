import 'package:flutter_test/flutter_test.dart';
import '../lib/map_rendering.dart';

void main() {
  test('Clay presentation exposes light and dark mint themes', () {
    expect(MapPresentation.light.theme.routeColor, 0xFF00F5D4);
    expect(MapPresentation.dark.theme.backgroundColor, 0xFF20252B);
    expect(MapPresentation.light.theme.pitch, 48);
  });
  test('markers receive stable display numbering', () {
    final result = numberedMarkers(const [
      MapMarker(id: 'a', latitude: 1, longitude: 2, color: 0xFF00F5D4),
      MapMarker(id: 'b', latitude: 3, longitude: 4, color: 0xFF00F5D4),
    ]);
    expect(result.map((m) => m.id), ['1:a', '2:b']);
  });
}
