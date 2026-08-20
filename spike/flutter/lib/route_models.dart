class Stop {
  const Stop({required this.id, required this.latitude, required this.longitude, this.label});
  final String id;
  final double latitude;
  final double longitude;
  final String? label;
  Map<String, Object?> toJson() => {'id': id, 'latitude': latitude, 'longitude': longitude, if (label != null) 'label': label};
}

class OrderedRoute {
  const OrderedRoute({required this.stops});
  final List<Stop> stops;
}
