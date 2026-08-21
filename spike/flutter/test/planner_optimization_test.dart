import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import '../lib/planner.dart';
import '../lib/routing_config.dart';
import '../lib/routing_transport.dart';
import '../lib/route_orchestrator.dart';
import '../lib/route_models.dart';
import '../lib/search_transport.dart';

Future<Map<String, Object?>> request(Uri uri, {required String body, required Map<String, String> headers}) async => {
  'orderedStopIds': ['s','a','e'],
  'sections': [{'polyline':'BFoz5xJ67i1B1B7PzIhaxL7Y','instructions':[{'action':'depart','distanceMeters':10}]}],
  'distanceMeters': 1200,
  'durationSeconds': 300,
};

void main() {
  test('planner receives ordered route and metrics from ORS/HERE orchestrator', () async {
    final config = const RoutingConfig(supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon');
    final transport = SupabaseRoutingClient(request, config: config);
    final planner = PlannerController(
      search: SupabaseSearchClient(request, config: config),
      orchestrator: RouteOrchestrator(client: transport),
    );
    final result = await planner.optimizeRoute(const [
      Stop(id: 's', latitude: 1, longitude: 1),
      Stop(id: 'a', latitude: 2, longitude: 2),
      Stop(id: 'e', latitude: 3, longitude: 3),
    ], accessToken: 'jwt');
    expect(result!.orderedRoute.stops.map((s) => s.id), ['s','a','e']);
    expect(result.route.distanceMeters, 1200);
    expect(result.route.durationSeconds, 300);
    planner.dispose();
  });
}
