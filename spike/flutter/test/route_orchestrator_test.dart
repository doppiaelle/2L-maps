import 'package:flutter_test/flutter_test.dart';

import '../lib/route_models.dart';
import '../lib/route_orchestrator.dart';
import '../lib/routing_config.dart';
import '../lib/routing_transport.dart';

void main() {
  const config = RoutingConfig(
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'public-anon-key',
  );
  const stops = [
    Stop(id: 'start', latitude: 45, longitude: 9),
    Stop(id: 'mid', latitude: 45.1, longitude: 9.1),
    Stop(id: 'end', latitude: 45.2, longitude: 9.2),
  ];

  test('orchestrator requests one server-mediated ordered route', () async {
    var calls = 0;
    final client = SupabaseRoutingClient(
      (uri, {required body, required headers}) async {
        calls++;
        expect(uri.host, 'example.supabase.co');
        return {
          'orderedStopIds': ['start', 'mid', 'end'],
          'distanceMeters': 100,
          'durationSeconds': 25,
          'sections': [
            {'polyline': 'encoded', 'instructions': []},
          ],
        };
      },
      config: config,
    );

    final plan = await RouteOrchestrator(client: client).buildPlan(
      stops,
      accessToken: 'user-jwt',
    );

    expect(calls, 1);
    expect(
      plan.orderedRoute.stops.map((stop) => stop.id),
      ['start', 'mid', 'end'],
    );
  });

  test('orchestrator rejects more than 25 stops before network calls', () async {
    final oversized = List.generate(
      26,
      (index) => Stop(id: '$index', latitude: 45, longitude: 9),
    );
    final client = SupabaseRoutingClient(
      (uri, {required body, required headers}) async {
        fail('network must not be called');
      },
      config: config,
    );

    await expectLater(
      RouteOrchestrator(client: client).buildPlan(
        oversized,
        accessToken: 'user-jwt',
      ),
      throwsArgumentError,
    );
  });
}
