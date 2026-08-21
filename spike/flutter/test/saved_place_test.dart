import 'package:flutter_test/flutter_test.dart';

import '../lib/saved_place.dart';

void main() {
  final fetchedAt = DateTime.utc(2026, 8, 1);
  final expiresAt = fetchedAt.add(const Duration(days: 30));

  SavedPlace place({ProviderCoordinates? coordinates}) => SavedPlace(
        id: 'internal-uuid',
        addressText: 'Via Roma 10, Milano',
        label: 'Consegna centro',
        coordinates: coordinates,
      );

  test('persists only durable user-authored content', () {
    expect(
      place().toUserContentJson(),
      {
        'id': 'internal-uuid',
        'address_text': 'Via Roma 10, Milano',
        'label': 'Consegna centro',
      },
    );
  });

  test('refreshes missing, expired and over-retained coordinates', () {
    expect(place().needsCoordinateRefresh(fetchedAt), isTrue);

    final fresh = ProviderCoordinates(
      latitude: 45.4642,
      longitude: 9.19,
      fetchedAt: fetchedAt,
      expiresAt: expiresAt,
    );
    expect(place(coordinates: fresh).needsCoordinateRefresh(fetchedAt), isFalse);
    expect(place(coordinates: fresh).needsCoordinateRefresh(expiresAt), isTrue);

    final invalid = ProviderCoordinates(
      latitude: 45.4642,
      longitude: 9.19,
      fetchedAt: fetchedAt,
      expiresAt: expiresAt.add(const Duration(seconds: 1)),
    );
    expect(place(coordinates: invalid).needsCoordinateRefresh(fetchedAt), isTrue);
  });

  test('rejects future timestamps and out-of-range coordinates', () {
    final invalid = ProviderCoordinates(
      latitude: 91,
      longitude: 9,
      fetchedAt: fetchedAt,
      expiresAt: expiresAt,
    );
    expect(invalid.isUsableAt(fetchedAt), isFalse);

    final valid = ProviderCoordinates(
      latitude: 45,
      longitude: 9,
      fetchedAt: fetchedAt,
      expiresAt: expiresAt,
    );
    expect(valid.isUsableAt(fetchedAt.subtract(const Duration(seconds: 1))), isFalse);
  });
}
