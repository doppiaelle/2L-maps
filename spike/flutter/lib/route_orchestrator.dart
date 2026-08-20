import 'here_routing.dart';
import 'ors_optimizer.dart';
import 'route_models.dart';
import 'routing_transport.dart';

class NavigationPlan {
  const NavigationPlan({required this.orderedRoute, required this.herePayload});
  final OrderedRoute orderedRoute;
  final Map<String, Object?> herePayload;
}

class RouteOrchestrator {
  const RouteOrchestrator({required this.ors, required this.here});
  final OrsRoutingClient ors;
  final HereRoutingClient here;

  Future<NavigationPlan> buildPlan(
    List<Stop> stops, {
    required String orsApiKey,
    required String hereApiKey,
  }) async {
    if (stops.length < 3) {
      throw ArgumentError.value(stops.length, 'stops', 'requires start, at least one stop, and destination');
    }
    if (stops.length > 25) {
      throw ArgumentError.value(stops.length, 'stops', 'maximum supported stops is 25');
    }
    final ordered = await ors.optimize(stops, apiKey: orsApiKey);
    final payload = await here.route(ordered, apiKey: hereApiKey);
    return NavigationPlan(orderedRoute: ordered, herePayload: payload);
  }
}
