class MapTheme {
  const MapTheme({required this.routeColor, required this.backgroundColor, required this.pitch});
  final int routeColor;
  final int backgroundColor;
  final double pitch;

  static const mintClay = MapTheme(routeColor: 0xFF00F5D4, backgroundColor: 0xFFF7F8FA, pitch: 48);
}

class RouteOverlay {
  const RouteOverlay({required this.polyline, required this.markers});
  final String polyline;
  final List<MapMarker> markers;
}

class MapMarker {
  const MapMarker({required this.id, required this.latitude, required this.longitude, required this.color});
  final String id;
  final double latitude;
  final double longitude;
  final int color;
}
