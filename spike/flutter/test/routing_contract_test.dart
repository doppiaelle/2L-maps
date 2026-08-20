import 'package:flutter_test/flutter_test.dart';
import '../lib/here_routing.dart';
import '../lib/ors_optimizer.dart';
import '../lib/route_models.dart';

void main() {
  final stops = [
    const Stop(id: 'start', latitude: 45, longitude: 9),
    const Stop(id: 'a', latitude: 45.1, longitude: 9.1),
    const Stop(id: 'end', latitude: 45.2, longitude: 9.2),
  ];

  test('ORS request keeps start/end and emits jobs for intermediate stops', () {
    final json = OrsOptimizationRequest(stops: stops).toJson();
    expect((json['jobs'] as List).length, 1);
    expect((json['vehicles'] as List).single['profile'], 'driving-car');
  });

  test('ORS parser rejects omitted stops', () {
    expect(
      () => const OrsOptimizationParser().parse({
        'routes': [{'steps': [{'type': 'job', 'job': 1}]}],
      }, stops),
      throwsFormatException,
    );
  });

  test('HERE request contains ordered route parameters', () {
    final uri = HereRoutingRequest(route: const OrderedRoute(stops: stops)).uri(apiKey: 'test');
    expect(uri.host, 'router.hereapi.com');
    expect(uri.queryParameters['origin'], '45.0,9.0');
    expect(uri.queryParameters['destination'], '45.2,9.2');
    expect(uri.queryParametersAll['via'], ['45.1,9.1']);
    expect(uri.queryParameters['return'], contains('turnByTurnActions'));
  });
}
