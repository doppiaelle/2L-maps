import 'package:flutter_test/flutter_test.dart';
import '../lib/external_navigation.dart';

void main() {
  test('builds geo link for current stop', () {
    final link = ExternalNavigationLink(latitude: 45, longitude: 9, label: 'Stop 1');
    expect(link.geoUri.scheme, 'geo');
    expect(link.geoUri.path, '45.0,9.0');
    expect(link.geoUri.queryParameters['q'], 'Stop 1');
  });

  test('provides non-Google web fallback', () {
    final link = ExternalNavigationLink(latitude: 45, longitude: 9);
    expect(link.webFallback.host, 'www.openstreetmap.org');
  });
}
