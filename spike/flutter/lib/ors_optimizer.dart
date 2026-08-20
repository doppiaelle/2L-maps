import 'dart:convert';
import 'route_models.dart';

class OrsOptimizationRequest {
  const OrsOptimizationRequest({required this.stops, this.profile = 'driving-car'});
  final List<Stop> stops;
  final String profile;

  Map<String, Object?> toJson() => {
    'jobs': [for (var i = 1; i < stops.length - 1; i++) {'id': i, 'location': [stops[i].longitude, stops[i].latitude]}],
    'vehicles': [{'id': 1, 'profile': profile, 'start': [stops.first.longitude, stops.first.latitude], 'end': [stops.last.longitude, stops.last.latitude]}],
  };

  String encode() => jsonEncode(toJson());
}

class OrsOptimizationParser {
  const OrsOptimizationParser();

  OrderedRoute parse(Map<String, Object?> payload, List<Stop> stops) {
    final routes = payload['routes'];
    if (routes is! List || routes.isEmpty || routes.first is! Map) throw const FormatException('ORS response has no routes');
    final steps = (routes.first as Map)['steps'];
    if (steps is! List) throw const FormatException('ORS response has no ordered steps');
    final byId = {for (var i = 0; i < stops.length; i++) i + 1: stops[i]};
    final ordered = <Stop>[stops.first];
    for (final step in steps) {
      if (step is Map && step['type'] == 'job') {
        final stop = byId[step['job']];
        if (stop == null) throw const FormatException('ORS returned unknown job');
        ordered.add(stop);
      }
    }
    ordered.add(stops.last);
    if (ordered.length != stops.length) throw const FormatException('ORS response omitted a stop');
    return OrderedRoute(stops: ordered);
  }
}
