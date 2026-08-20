import 'package:flutter_test/flutter_test.dart';
import '../lib/map_presenter.dart';
import '../lib/map_rendering.dart';

class FakeRenderer implements MapRenderer {
  MapTheme? theme;
  RouteOverlay? overlay;
  double? pitch;
  @override
  Future<void> setTheme(MapTheme value) async => theme = value;
  @override
  Future<void> showRoute(RouteOverlay value) async => overlay = value;
  @override
  Future<void> setCamera({required latitude, required longitude, required zoom, required double pitch}) async => this.pitch = pitch;
}

void main() {
  test('presenter applies theme and route overlay', () async {
    final renderer = FakeRenderer();
    await MapPresenter(renderer).present(const RouteOverlay(polyline: 'p', markers: []));
    expect(renderer.theme, MapTheme.mintClay);
    expect(renderer.overlay!.polyline, 'p');
  });

  test('follow position uses pitched Clay camera', () async {
    final renderer = FakeRenderer();
    await MapPresenter(renderer).followPosition(latitude: 45, longitude: 9);
    expect(renderer.pitch, MapTheme.mintClay.pitch);
  });
}
