import 'package:flutter_test/flutter_test.dart';
import '../lib/route_models.dart';
import '../lib/routing_transport.dart';

void main() {
  test('circuit breaker opens after threshold and resets on success', () {
    final breaker = RoutingCircuitBreaker(maxFailures: 2, cooldown: const Duration(hours: 1));
    breaker.recordFailure();
    expect(breaker.isOpen, isFalse);
    breaker.recordFailure();
    expect(breaker.isOpen, isTrue);
    breaker.recordSuccess();
    expect(breaker.isOpen, isFalse);
  });

  test('ORS client sends JSON and parses injected response', () async {
    Uri? uri;
    final client = OrsRoutingClient((requestUri, {required body, required headers}) async {
      uri = requestUri;
      return {'routes': [{'steps': [{'type': 'job', 'job': 1}]}]};
    });
    const stops = [
      Stop(id: 'start', latitude: 45, longitude: 9),
      Stop(id: 'mid', latitude: 45.1, longitude: 9.1),
      Stop(id: 'end', latitude: 45.2, longitude: 9.2),
    ];
    final route = await client.optimize(stops, apiKey: 'test');
    expect(uri!.host, 'api.heigit.org');
    expect(route.stops.map((s) => s.id), ['start', 'mid', 'end']);
  });
}
