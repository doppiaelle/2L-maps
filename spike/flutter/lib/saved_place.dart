class SavedPlace {
  const SavedPlace({
    required this.id,
    required this.addressText,
    this.label,
    this.note,
    this.coordinates,
  });

  final String id;
  final String addressText;
  final String? label;
  final String? note;
  final ProviderCoordinates? coordinates;

  bool needsCoordinateRefresh(DateTime now) {
    final cached = coordinates;
    return cached == null || !cached.isUsableAt(now);
  }

  Map<String, Object?> toUserContentJson() => {
        'id': id,
        'address_text': addressText,
        if (label != null) 'label': label,
        if (note != null) 'note': note,
      };
}

class ProviderCoordinates {
  const ProviderCoordinates({
    required this.latitude,
    required this.longitude,
    required this.fetchedAt,
    required this.expiresAt,
  });

  static const maxRetention = Duration(days: 30);

  final double latitude;
  final double longitude;
  final DateTime fetchedAt;
  final DateTime expiresAt;

  bool isUsableAt(DateTime now) {
    if (latitude < -90 || latitude > 90) return false;
    if (longitude < -180 || longitude > 180) return false;
    if (!expiresAt.isAfter(fetchedAt)) return false;
    if (expiresAt.difference(fetchedAt) > maxRetention) return false;
    return !now.isBefore(fetchedAt) && now.isBefore(expiresAt);
  }
}
