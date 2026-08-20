import 'map_rendering.dart';

abstract interface class MapRenderer {
  Future<void> setTheme(MapTheme theme);
  Future<void> showRoute(RouteOverlay overlay);
  Future<void> setCamera({required double latitude, required double longitude, required double zoom, required double pitch});
}

class MapPresenter {
  const MapPresenter(this.renderer);
  final MapRenderer renderer;

  Future<void> present(RouteOverlay overlay, {MapTheme theme = MapTheme.mintClay}) async {
    await renderer.setTheme(theme);
    await renderer.showRoute(overlay);
  }

  Future<void> followPosition({required double latitude, required double longitude, double zoom = 16}) =>
      renderer.setCamera(latitude: latitude, longitude: longitude, zoom: zoom, pitch: MapTheme.mintClay.pitch);
}
