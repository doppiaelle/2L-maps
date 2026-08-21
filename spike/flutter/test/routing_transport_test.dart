import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import '../lib/route_models.dart';
import '../lib/routing_config.dart';
import '../lib/routing_transport.dart';

const config = RoutingConfig(
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'public-anon-key',
);

const stops = [
  Stop(id: 'start', latitude: 45, longitude: 9),
  Stop(id: 'mid', latitude: 45.1, longitude: 9.1),
  Stop(id: 'end', latitude: 45.2, longitude: 9.2),
];

Map<String, Object?> response({
  List<String> ids = const ['start', 'mid', 'end'],
}) =>
    {
      'orderedStopIds': ids,
      'distanceMeters': 1200,
      'durationSeconds': 300,
      'routeHandle': 'route-handle',
      'sections': [
        {
          'polyline': 'first-polyline',
          'instructions': [
            {
              'action': 'depart',
              'distanceMeters': 30,
              'durationSeconds': 10,
            },
          ],
        },
      ],
    };

void main() {
  test('circuit breaker opens after threshold and resets on success', () {
    final breaker = RoutingCircuitBreaker(
      maxFailures: 2,
      cooldown: const Duration(hours: 1),
    );
    breaker.recordFailure();
    expect(breaker.isOpen, isFalse);
    breaker.recordFailure();
    expect(breaker.isOpen, isTrue);
    breaker.recordSuccess();
    expect(breaker.isOpen, isFalse);
  });

  test('routing uses authenticated Supabase without provider credentials', () async {
    Uri? uri;
    Map<String, String>? sentHeaders;
    String? sentBody;

    final client = SupabaseRoutingClient(
      (requestUri, {required body, required headers}) async {
        uri = requestUri;
        sentHeaders = headers;
        sentBody = body;
        return response();
      },
      config: config,
    );

    final plan = await client.optimize(stops, accessToken: 'user-jwt');

    expect(uri!.toString(), 'https://example.supabase.co/functions/v1/hybrid-optimize');
    expect(sentHeaders!['authorization'], 'Bearer user-jwt');
    expect(sentHeaders!['apikey'], 'public-anon-key');
    expect((jsonDecode(sentBody!) as Map)['stops'], hasLength(3));
    expect(plan.orderedRoute.stops.map((stop) => stop.id), ['start', 'mid', 'end']);
    expect(plan.route.distanceMeters, 1200);
    expect(plan.route.routeHandle, 'route-handle');
    expect(uri!.toString(), isNot(contains('api.heigit.org')));
    expect(uri!.toString(), isNot(contains('router.hereapi.com')));
  });

  test('routing refuses a duplicated stop returned by the server', () async {
    final client = SupabaseRoutingClient(
      (uri, {required body, required headers}) async =>
          response(ids: ['start', 'start', 'end']),
      config: config,
    );

    await expectLater(
      client.optimize(stops, accessToken: 'user-jwt'),
      throwsFormatException,
    );
  });

  test('routing requires a user JWT before sending a request', () async {
    final client = SupabaseRoutingClient(
      (uri, {required body, required headers}) async {
        fail('a request without a JWT must not reach the network');
      },
      config: config,
    );

    await expectLater(
      client.optimize(stops, accessToken: ''),
      throwsArgumentError,
    );
  });
}
