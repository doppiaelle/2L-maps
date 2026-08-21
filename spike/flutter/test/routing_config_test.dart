import 'package:flutter_test/flutter_test.dart';

import '../lib/routing_config.dart';

void main() {
  test('empty runtime config is not configured', () {
    expect(
      const RoutingConfig(
        supabaseUrl: '',
        supabaseAnonKey: '',
      ).isConfigured,
      isFalse,
    );
  });

  test('Supabase public URL and anon key are required', () {
    expect(
      const RoutingConfig(
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: '',
      ).isConfigured,
      isFalse,
    );
    expect(
      const RoutingConfig(
        supabaseUrl: '',
        supabaseAnonKey: 'public-anon-key',
      ).isConfigured,
      isFalse,
    );
    expect(
      const RoutingConfig(
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'public-anon-key',
      ).isConfigured,
      isTrue,
    );
  });
}
