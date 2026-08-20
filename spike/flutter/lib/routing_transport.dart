import 'dart:async';
import 'dart:convert';

import 'here_routing.dart';
import 'ors_optimizer.dart';
import 'route_models.dart';

typedef JsonRequest = Future<Map<String, Object?>> Function(Uri uri, {required String body, required Map<String, String> headers});

class RoutingCircuitBreaker {
  RoutingCircuitBreaker({this.maxFailures = 3, this.cooldown = const Duration(minutes: 1)});
  final int maxFailures;
  final Duration cooldown;
  int _failures = 0;
  DateTime? _openedAt;

  bool get isOpen => _openedAt != null && DateTime.now().difference(_openedAt!) < cooldown;

  void recordSuccess() { _failures = 0; _openedAt = null; }
  void recordFailure() {
    _failures++;
    if (_failures >= maxFailures) _openedAt = DateTime.now();
  }
}

class OrsRoutingClient {
  const OrsRoutingClient(this.request, {this.breaker});
  final JsonRequest request;
  final RoutingCircuitBreaker? breaker;

  Future<OrderedRoute> optimize(List<Stop> stops, {required String apiKey}) async {
    if (stops.length < 3) throw ArgumentError('At least start, stop and destination are required');
    if (breaker?.isOpen ?? false) throw StateError('ORS circuit breaker is open');
    try {
      final response = await request(
        Uri.parse('https://api.heigit.org/vroom/v0/optimization?api_key=$apiKey'),
        body: OrsOptimizationRequest(stops: stops).encode(),
        headers: const {'content-type': 'application/json'},
      );
      final route = const OrsOptimizationParser().parse(response, stops);
      breaker?.recordSuccess();
      return route;
    } catch (_) {
      breaker?.recordFailure();
      rethrow;
    }
  }
}

class HereRoutingClient {
  const HereRoutingClient(this.request, {this.breaker});
  final JsonRequest request;
  final RoutingCircuitBreaker? breaker;

  Future<Map<String, Object?>> route(OrderedRoute route, {required String apiKey}) async {
    if (breaker?.isOpen ?? false) throw StateError('HERE circuit breaker is open');
    try {
      final response = await request(HereRoutingRequest(route: route).uri(apiKey: apiKey), body: jsonEncode({}), headers: const {});
      breaker?.recordSuccess();
      return response;
    } catch (_) {
      breaker?.recordFailure();
      rethrow;
    }
  }
}
