class ExternalNavigationLink {
  const ExternalNavigationLink({required this.latitude, required this.longitude, this.label});
  final double latitude;
  final double longitude;
  final String? label;

  Uri get geoUri => Uri(
        scheme: 'geo',
        path: '$latitude,$longitude',
        queryParameters: {if (label != null) 'q': label},
      );

  Uri get webFallback => Uri.https(
        'www.openstreetmap.org',
        '/directions',
        {'to': '$latitude,$longitude'},
      );
}
