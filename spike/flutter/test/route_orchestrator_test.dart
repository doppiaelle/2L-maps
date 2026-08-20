import 'package:flutter_test/flutter_test.dart';
import '../lib/route_models.dart';
import '../lib/route_orchestrator.dart';
import '../lib/routing_transport.dart';

void main() {
  const stops = [
    Stop(id: 'start', latitude: 45, longitude: 9),
    Stop(id: 'mid', latitude: 45.1, longitude: 9.1),
    Stop(id: 'end', latitude: 45.2, longitude: 9.2),
  ];

  test('orchestrator performs ORS then HERE with ordered route', () async {
    final calls = <String>[];
    final ors = OrsRoutingClient((uri, {required body, required headers}) async {
      calls.add('ors');
      return {'routes': [{'steps': [{'type': 'job', 'job': 1}]}]};
    });
    final here = HereRoutingClient((uri, {required body, required headers}) async {
      calls.add('here');
      expect(uri.queryParameters['origin'], '45.0,9.0');
      return {'routes': []};
    });
    final plan = await RouteOrchestrator(ors: ors, here: here).buildPlan(
      stops,
      orsApiKey: 'ors',
      hereApiKey: 'here',
    );
    expect(calls, ['ors', 'here']);
    expect(plan.orderedRoute.stops.map((stop) => stop.id), ['start', 'mid', 'end']);
  });

  test('orchestrator rejects more than 25 stops before network calls', () async {
    final stops25 = List.generate(26, (i) => Stop(id: '$i', latitude: 45, longitude: 9));
    final client = OrsRoutingClient((uri, {required body, required headers}) async {
      fail('network must not be called');
    });
    final here = HereRoutingClient((uri, {required body, required headers}) async {
      fail('network must not be called');
    });
    expect(
      () => RouteOrchestrator(ors: client, here: here).buildPlan(
        stops25,
        orsApiKey: 'ors',
        hereApiKey: 'here',
      ),
      throwsArgumentError,
    );
  });
}
