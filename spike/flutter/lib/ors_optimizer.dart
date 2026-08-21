import 'dart:convert';

import 'route_models.dart';

class OrsOptimizationRequest {
  const OrsOptimizationRequest({
    required this.stops,
    this.profile = 'driving-car',
  });

  final List<Stop> stops;
  final String profile;

  Map<String, Object?> toJson() => {
        'jobs': [
          for (var i = 1; i < stops.length - 1; i++)
            {
              'id': i,
              'location': [stops[i].longitude, stops[i].latitude],
            },
        ],
        'vehicles': [
          {
            'id': 1,
            'profile': profile,
            'start': [stops.first.longitude, stops.first.latitude],
            'end': [stops.last.longitude, stops.last.latitude],
          },
        ],
      };

  String encode() => jsonEncode(toJson());
}

class OrsOptimizationParser {
  const OrsOptimizationParser();

  OrderedRoute parse(Map<String, Object?> payload, List<Stop> stops) {
    final unassigned = payload['unassigned'];
    if (unassigned is List && unassigned.isNotEmpty) {
      throw const FormatException('ORS response has unassigned stops');
    }

    final routes = payload['routes'];
    if (routes is! List || routes.length != 1 || routes.first is! Map) {
      throw const FormatException('ORS response has no single vehicle route');
    }

    final steps = (routes.first as Map)['steps'];
    if (steps is! List) {
      throw const FormatException('ORS response has no ordered steps');
    }

    final byId = {
      for (var i = 1; i < stops.length - 1; i++) i: stops[i],
    };
    final visited = <int>{};
    final ordered = <Stop>[stops.first];

    for (final step in steps) {
      if (step is! Map || step['type'] != 'job') continue;

      final id = step['job'];
      if (id is! int || !visited.add(id)) {
        throw const FormatException('ORS returned a duplicated or invalid job');
      }

      final stop = byId[id];
      if (stop == null) {
        throw const FormatException('ORS returned an unknown job');
      }
      ordered.add(stop);
    }

    if (visited.length != byId.length) {
      throw const FormatException('ORS response omitted a stop');
    }

    ordered.add(stops.last);
    return OrderedRoute(stops: ordered);
  }
}
