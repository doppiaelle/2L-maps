import 'navigation_models.dart';

class HereRouteParser {
  const HereRouteParser();

  HereRouteResult parse(Map<String, Object?> payload) {
    final routes = payload['routes'];
    if (routes is! List || routes.isEmpty || routes.first is! Map) {
      throw const FormatException('HERE response has no routes');
    }

    final route = routes.first as Map;
    final sections = route['sections'];
    if (sections is! List || sections.isEmpty) {
      throw const FormatException('HERE response has no sections');
    }

    final polylines = <String>[];
    final instructions = <NavigationInstruction>[];
    var distanceMeters = 0.0;
    var durationSeconds = 0.0;

    for (final value in sections) {
      if (value is! Map) {
        throw const FormatException('HERE response has an invalid section');
      }

      final summary = value['summary'];
      final polyline = value['polyline'];
      if (summary is! Map) {
        throw const FormatException('HERE section has no summary');
      }
      if (polyline is! String || polyline.isEmpty) {
        throw const FormatException('HERE section has no polyline');
      }

      final distance = summary['length'];
      final duration = summary['duration'];
      if (distance is! num || duration is! num) {
        throw const FormatException('HERE section summary is incomplete');
      }

      polylines.add(polyline);
      distanceMeters += distance.toDouble();
      durationSeconds += duration.toDouble();

      final actions = value['actions'];
      if (actions is List) {
        for (final action in actions) {
          if (action is Map && action['action'] is String) {
            instructions.add(
              NavigationInstruction(
                action: action['action'] as String,
                distanceMeters: (action['length'] as num?)?.toDouble() ?? 0,
                durationSeconds: (action['duration'] as num?)?.toDouble(),
              ),
            );
          }
        }
      }
    }

    return HereRouteResult(
      polyline: polylines.first,
      sectionPolylines: polylines,
      distanceMeters: distanceMeters,
      durationSeconds: durationSeconds,
      instructions: instructions,
      routeHandle:
          route['routeHandle'] is String ? route['routeHandle'] as String : null,
    );
  }
}
