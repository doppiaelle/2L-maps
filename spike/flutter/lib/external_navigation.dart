import 'package:flutter/foundation.dart';

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

  Uri get appleMapsUri => Uri.https(
        'maps.apple.com',
        '/',
        {'daddr': '$latitude,$longitude', if (label != null) 'q': label},
      );

  Uri get googleMapsUri => Uri.https(
        'www.google.com',
        '/maps/dir/',
        {'api': '1', 'destination': '$latitude,$longitude'},
      );

  Uri get webFallback => Uri.https(
        'www.openstreetmap.org',
        '/directions',
        {'to': '$latitude,$longitude'},
      );

  Uri forNavigator(ExternalNavigator navigator) {
    switch (navigator) {
      case ExternalNavigator.appleMaps:
        return appleMapsUri;
      case ExternalNavigator.googleMaps:
        return googleMapsUri;
      case ExternalNavigator.androidGeo:
        return geoUri;
      case ExternalNavigator.web:
        return webFallback;
    }
  }
}

enum ExternalNavigator { appleMaps, googleMaps, androidGeo, web }

abstract interface class ExternalNavigationLauncher {
  Future<bool> canLaunch(Uri uri);
  Future<bool> launch(Uri uri);
}

class ExternalNavigationController {
  ExternalNavigationController(this.launcher);

  final ExternalNavigationLauncher launcher;

  Future<bool> openCurrentStop({
    required ExternalNavigationLink? currentStop,
    required TargetPlatform platform,
    ExternalNavigator? preferred,
  }) async {
    if (currentStop == null) return false;
    final navigator = preferred ??
        (platform == TargetPlatform.iOS
            ? ExternalNavigator.appleMaps
            : ExternalNavigator.androidGeo);
    final primary = currentStop.forNavigator(navigator);
    if (await launcher.canLaunch(primary)) return launcher.launch(primary);
    final fallback = currentStop.webFallback;
    if (!await launcher.canLaunch(fallback)) return false;
    return launcher.launch(fallback);
  }
}
