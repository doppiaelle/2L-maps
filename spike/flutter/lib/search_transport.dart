import 'dart:convert';

import 'routing_config.dart';
import 'routing_transport.dart';
import 'saved_place.dart';

class AddressSuggestion {
  const AddressSuggestion({
    required this.address,
    required this.latitude,
    required this.longitude,
  });

  final String address;
  final double latitude;
  final double longitude;
}

class SavedPlaceResult {
  const SavedPlaceResult({
    required this.resolved,
    required this.unresolved,
  });

  final List<SavedPlace> resolved;
  final List<Map<String, Object?>> unresolved;
}

class SupabaseSearchClient {
  const SupabaseSearchClient(this.request, {required this.config});

  final JsonRequest request;
  final RoutingConfig config;

  Future<List<AddressSuggestion>> suggest(
    String input, {
    required String accessToken,
    double? latitude,
    double? longitude,
  }) async {
    final payload = await _post(
      'here-search',
      {
        'input': input,
        if (latitude != null && longitude != null)
          'bias': {'lat': latitude, 'lng': longitude},
      },
      accessToken,
    );

    final raw = payload['suggestions'];
    if (raw is! List) {
      throw const FormatException('Search response is incomplete');
    }

    return raw.map((item) {
      if (item is! Map ||
          item['address'] is! String ||
          item['latitude'] is! num ||
          item['longitude'] is! num) {
        throw const FormatException('Search suggestion is invalid');
      }
      return AddressSuggestion(
        address: item['address'] as String,
        latitude: (item['latitude'] as num).toDouble(),
        longitude: (item['longitude'] as num).toDouble(),
      );
    }).toList();
  }

  Future<SavedPlaceResult> geocode(
    List<String> addresses, {
    required String accessToken,
  }) async {
    return _parseSavedPlaces(
      await _post('here-geocode', {'addresses': addresses}, accessToken),
    );
  }

  Future<SavedPlaceResult> refresh(
    List<String> savedPlaceIds, {
    required String accessToken,
  }) async {
    return _parseSavedPlaces(
      await _post(
        'here-place-details',
        {'savedPlaceIds': savedPlaceIds},
        accessToken,
      ),
    );
  }

  Future<Map<String, Object?>> _post(
    String functionName,
    Map<String, Object?> payload,
    String accessToken,
  ) {
    if (!config.isConfigured) {
      throw StateError('Supabase search is not configured');
    }
    if (accessToken.isEmpty) {
      throw ArgumentError.value(accessToken, 'accessToken', 'JWT is required');
    }

    final endpoint = Uri.parse(config.supabaseUrl).resolve(
      '/functions/v1/$functionName',
    );

    return request(
      endpoint,
      body: jsonEncode(payload),
      headers: {
        'authorization': 'Bearer $accessToken',
        'apikey': config.supabaseAnonKey,
        'content-type': 'application/json',
      },
    );
  }

  SavedPlaceResult _parseSavedPlaces(Map<String, Object?> payload) {
    final rawResolved = payload['resolved'];
    final rawUnresolved = payload['unresolved'];
    if (rawResolved is! List || rawUnresolved is! List) {
      throw const FormatException('Saved place response is incomplete');
    }

    final resolved = rawResolved.map((item) {
      if (item is! Map ||
          item['savedPlaceId'] is! String ||
          item['addressText'] is! String ||
          item['latitude'] is! num ||
          item['longitude'] is! num ||
          item['fetchedAt'] is! String ||
          item['expiresAt'] is! String) {
        throw const FormatException('Saved place response is invalid');
      }

      return SavedPlace(
        id: item['savedPlaceId'] as String,
        addressText: item['addressText'] as String,
        coordinates: ProviderCoordinates(
          latitude: (item['latitude'] as num).toDouble(),
          longitude: (item['longitude'] as num).toDouble(),
          fetchedAt: DateTime.parse(item['fetchedAt'] as String),
          expiresAt: DateTime.parse(item['expiresAt'] as String),
        ),
      );
    }).toList();

    final unresolved = rawUnresolved.map((item) {
      if (item is! Map) {
        throw const FormatException('Unresolved place response is invalid');
      }
      return Map<String, Object?>.from(item);
    }).toList();

    return SavedPlaceResult(resolved: resolved, unresolved: unresolved);
  }
}
