import 'dart:async';
import 'dart:convert';

import 'navigation_models.dart';
import 'route_models.dart';
import 'routing_config.dart';

typedef JsonRequest = Future<Map<String, Object?>> Function(
  Uri uri, {
  required String body,
  required Map<String, String> headers,
});

class RoutingCircuitBreaker {
  RoutingCircuitBreaker({
    this.maxFailures = 3,
    this.cooldown = const Duration(minutes: 1),
  });

  final int maxFailures;
  final Duration cooldown;
  int _failures = 0;
  DateTime? _openedAt;

  bool get isOpen =>
      _openedAt != null && DateTime.now().difference(_openedAt!) < cooldown;

  void recordSuccess() {
    _failures = 0;
    _openedAt = null;
  }

  void recordFailure() {
    _failures++;
    if (_failures >= maxFailures) _openedAt = DateTime.now();
  }
}

class SupabaseRoutingClient {
  const SupabaseRoutingClient(
    this.request, {
    required this.config,
    this.breaker,
  });

  final JsonRequest request;
  final RoutingConfig config;
  final RoutingCircuitBreaker? breaker;

  Future<ServerNavigationPlan> optimize(
    List<Stop> stops, {
    required String accessToken,
  }) async {
    if (!config.isConfigured) {
      throw StateError('Supabase routing is not configured');
    }
    if (accessToken.isEmpty) {
      throw ArgumentError.value(accessToken, 'accessToken', 'JWT is required');
    }
    if (breaker?.isOpen ?? false) {
      throw StateError('Routing circuit breaker is open');
    }

    try {
      final endpoint = Uri.parse(config.supabaseUrl).resolve(
        '/functions/v1/hybrid-optimize',
      );
      final response = await request(
        endpoint,
        body: jsonEncode({
          'stops': stops.map((stop) => stop.toJson()).toList(),
        }),
        headers: {
          'authorization': 'Bearer $accessToken',
          'apikey': config.supabaseAnonKey,
          'content-type': 'application/json',
        },
      );
      final result = _parse(response, stops);
      breaker?.recordSuccess();
      return result;
    } catch (_) {
      breaker?.recordFailure();
      rethrow;
    }
  }

  ServerNavigationPlan _parse(
    Map<String, Object?> payload,
    List<Stop> originalStops,
  ) {
    final ids = payload['orderedStopIds'];
    final rawSections = payload['sections'];
    if (ids is! List || rawSections is! List || rawSections.isEmpty) {
      throw const FormatException('Server route response is incomplete');
    }

    final byId = {for (final stop in originalStops) stop.id: stop};
    final visited = <String>{};
    final ordered = <Stop>[];

    for (final id in ids) {
      if (id is! String || !visited.add(id) || !byId.containsKey(id)) {
        throw const FormatException('Server returned an invalid stop order');
      }
      ordered.add(byId[id]!);
    }
    if (ordered.length != originalStops.length) {
      throw const FormatException('Server omitted one or more stops');
    }

    final polylines = <String>[];
    final instructions = <NavigationInstruction>[];
    for (final value in rawSections) {
      if (value is! Map || value['polyline'] is! String) {
        throw const FormatException('Server returned an invalid route section');
      }
      final polyline = value['polyline'] as String;
      if (polyline.isEmpty) {
        throw const FormatException('Server returned an empty route section');
      }
      polylines.add(polyline);

      final actions = value['instructions'];
      if (actions is List) {
        for (final action in actions) {
          if (action is Map && action['action'] is String) {
            instructions.add(
              NavigationInstruction(
                action: action['action'] as String,
                distanceMeters:
                    (action['distanceMeters'] as num?)?.toDouble() ?? 0,
                durationSeconds:
                    (action['durationSeconds'] as num?)?.toDouble(),
              ),
            );
          }
        }
      }
    }

    final distance = payload['distanceMeters'];
    final duration = payload['durationSeconds'];
    if (distance is! num || duration is! num) {
      throw const FormatException('Server route summary is incomplete');
    }

    return ServerNavigationPlan(
      orderedRoute: OrderedRoute(stops: ordered),
      route: HereRouteResult(
        polyline: polylines.first,
        sectionPolylines: polylines,
        distanceMeters: distance.toDouble(),
        durationSeconds: duration.toDouble(),
        instructions: instructions,
        routeHandle: payload['routeHandle'] as String?,
      ),
    );
  }
}

class ServerNavigationPlan {
  const ServerNavigationPlan({
    required this.orderedRoute,
    required this.route,
  });

  final OrderedRoute orderedRoute;
  final HereRouteResult route;
}
