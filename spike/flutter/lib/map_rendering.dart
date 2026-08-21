class MapTheme {
  const MapTheme({required this.routeColor, required this.backgroundColor, required this.pitch});
  final int routeColor;
  final int backgroundColor;
  final double pitch;

  static const mintClay = MapTheme(routeColor: 0xFF00F5D4, backgroundColor: 0xFFF7F8FA, pitch: 48);
  static const mintClayDark = MapTheme(routeColor: 0xFF2EC4B6, backgroundColor: 0xFF20252B, pitch: 48);
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

class MapPresentation {
  const MapPresentation({required this.theme, required this.followPosition, required this.showOverview});
  final MapTheme theme;
  final bool followPosition;
  final bool showOverview;
  static const light = MapPresentation(theme: MapTheme.mintClay, followPosition: false, showOverview: true);
  static const dark = MapPresentation(theme: MapTheme.mintClayDark, followPosition: false, showOverview: true);
}

List<MapMarker> numberedMarkers(List<MapMarker> markers) => [
  for (var i = 0; i < markers.length; i++)
    MapMarker(id: '\${i + 1}:\${markers[i].id}', latitude: markers[i].latitude, longitude: markers[i].longitude, color: markers[i].color),
];
