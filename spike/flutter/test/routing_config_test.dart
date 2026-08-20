import 'package:flutter_test/flutter_test.dart';
import '../lib/routing_config.dart';

void main() {
  test('empty runtime config is not configured', () {
    expect(const RoutingConfig(orsApiKey: '', hereApiKey: '').isConfigured, isFalse);
  });

  test('both provider keys are required', () {
    expect(const RoutingConfig(orsApiKey: 'ors', hereApiKey: '').isConfigured, isFalse);
    expect(const RoutingConfig(orsApiKey: '', hereApiKey: 'here').isConfigured, isFalse);
    expect(const RoutingConfig(orsApiKey: 'ors', hereApiKey: 'here').isConfigured, isTrue);
  });
}
