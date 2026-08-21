import 'route_models.dart';
import 'routing_transport.dart';

class RouteOrchestrator {
  const RouteOrchestrator({required this.client});

  final SupabaseRoutingClient client;

  Future<ServerNavigationPlan> buildPlan(
    List<Stop> stops, {
    required String accessToken,
  }) async {
    if (stops.length < 3) {
      throw ArgumentError.value(
        stops.length,
        'stops',
        'requires start, at least one stop, and destination',
      );
    }
    if (stops.length > 25) {
      throw ArgumentError.value(
        stops.length,
        'stops',
        'maximum supported stops is 25',
      );
    }

    return client.optimize(stops, accessToken: accessToken);
  }
}
