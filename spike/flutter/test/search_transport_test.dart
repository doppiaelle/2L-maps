import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import '../lib/routing_config.dart';
import '../lib/search_transport.dart';

const _config = RoutingConfig(
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'public-anon-key',
);

Map<String, Object?> _savedPlaceResponse() => {
      'resolved': [
        {
          'savedPlaceId': 'internal-user-uuid',
          'addressText': 'Via Roma 1',
          'formattedAddress': 'Via Roma 1, Bergamo',
          'latitude': 45.7,
          'longitude': 9.7,
          'fetchedAt': '2026-08-21T12:00:00.000Z',
          'expiresAt': '2026-09-20T12:00:00.000Z',
          'index': 0,
        },
      ],
      'unresolved': [
        {'index': 1, 'input': 'unknown'},
      ],
    };

void main() {
  test('HERE suggestions use authenticated Supabase, never provider keys', () async {
    Uri? sentUri;
    String? sentBody;
    Map<String, String>? sentHeaders;

    final client = SupabaseSearchClient(
      (uri, {required body, required headers}) async {
        sentUri = uri;
        sentBody = body;
        sentHeaders = headers;
        return {
          'suggestions': [
            {'address': 'Via Roma 1', 'latitude': 45.7, 'longitude': 9.7},
          ],
        };
      },
      config: _config,
    );

    final suggestions = await client.suggest(
      'Via Roma',
      accessToken: 'user-jwt',
      latitude: 45.7,
      longitude: 9.7,
    );

    expect(
      sentUri.toString(),
      'https://example.supabase.co/functions/v1/here-search',
    );
    expect(sentHeaders!['authorization'], 'Bearer user-jwt');
    expect(sentHeaders!['apikey'], 'public-anon-key');
    expect((jsonDecode(sentBody!) as Map)['bias'], {'lat': 45.7, 'lng': 9.7});
    expect(suggestions.single.address, 'Via Roma 1');
    expect(sentUri.toString(), isNot(contains('hereapi.com')));
  });

  test('geocoding preserves user text and provider-neutral saved identifiers', () async {
    final client = SupabaseSearchClient(
      (uri, {required body, required headers}) async {
        expect(uri.path, '/functions/v1/here-geocode');
        return _savedPlaceResponse();
      },
      config: _config,
    );

    final result = await client.geocode(
      ['Via Roma 1', 'unknown'],
      accessToken: 'user-jwt',
    );

    expect(result.resolved.single.id, 'internal-user-uuid');
    expect(result.resolved.single.addressText, 'Via Roma 1');
    expect(result.resolved.single.coordinates!.latitude, 45.7);
    expect(result.unresolved.single['input'], 'unknown');
  });

  test('refresh sends only internal saved-place identifiers', () async {
    final client = SupabaseSearchClient(
      (uri, {required body, required headers}) async {
        expect(uri.path, '/functions/v1/here-place-details');
        expect((jsonDecode(body) as Map)['savedPlaceIds'], ['internal-uuid']);
        return _savedPlaceResponse();
      },
      config: _config,
    );

    final result = await client.refresh(
      ['internal-uuid'],
      accessToken: 'user-jwt',
    );
    expect(result.resolved, hasLength(1));
  });

  test('search requires a user JWT before reaching the network', () async {
    final client = SupabaseSearchClient(
      (uri, {required body, required headers}) async {
        fail('a request without a JWT must not reach the network');
      },
      config: _config,
    );

    await expectLater(
      client.suggest('Via Roma', accessToken: ''),
      throwsArgumentError,
    );
  });
}
