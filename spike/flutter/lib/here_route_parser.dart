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
    if (sections is! List || sections.isEmpty || sections.first is! Map) {
      throw const FormatException('HERE response has no sections');
    }
    final section = sections.first as Map;
    final summary = section['summary'];
    if (summary is! Map) throw const FormatException('HERE response has no summary');
    final polyline = section['polyline'];
    if (polyline is! String || polyline.isEmpty) throw const FormatException('HERE response has no polyline');
    final actions = section['actions'];
    final instructions = <NavigationInstruction>[];
    if (actions is List) {
      for (final action in actions) {
        if (action is Map && action['action'] is String) {
          instructions.add(NavigationInstruction(
            action: action['action'] as String,
            distanceMeters: (action['length'] as num?)?.toDouble() ?? 0,
            durationSeconds: (action['duration'] as num?)?.toDouble(),
          ));
        }
      }
    }
    final distance = (summary['length'] as num?)?.toDouble();
    final duration = (summary['duration'] as num?)?.toDouble();
    if (distance == null || duration == null) throw const FormatException('HERE summary is incomplete');
    return HereRouteResult(
      polyline: polyline,
      distanceMeters: distance,
      durationSeconds: duration,
      instructions: instructions,
    );
  }
}
