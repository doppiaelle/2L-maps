class NavigationInstruction {
  const NavigationInstruction({
    required this.action,
    required this.distanceMeters,
    this.durationSeconds,
  });

  final String action;
  final double distanceMeters;
  final double? durationSeconds;
}

class HereRouteResult {
  const HereRouteResult({
    required this.polyline,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.instructions,
    this.sectionPolylines = const [],
    this.routeHandle,
  });

  final String polyline;
  final double distanceMeters;
  final double durationSeconds;
  final List<NavigationInstruction> instructions;
  final List<String> sectionPolylines;
  final String? routeHandle;
}
