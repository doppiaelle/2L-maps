import 'package:flutter_test/flutter_test.dart';
import 'package:twol_maps_spike/auth_service.dart';

void main() {
  test('Flutter auth uses the registered mobile callback URI', () {
    expect(AuthSessionController.redirectUri, 'twolmaps://auth-callback');
  });
}