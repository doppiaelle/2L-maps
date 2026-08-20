import 'package:flutter_test/flutter_test.dart';
import 'package:twol_maps_spike/spike_config.dart';

void main() {
  test('configuration is incomplete when either credential is empty', () {
    expect(
      const SpikeConfig(accessKeyId: 'id', accessKeySecret: '').isConfigured,
      isFalse,
    );
    expect(
      const SpikeConfig(accessKeyId: '', accessKeySecret: 'secret').isConfigured,
      isFalse,
    );
  });

  test('configuration is valid when both credentials are present', () {
    expect(
      const SpikeConfig(accessKeyId: 'id', accessKeySecret: 'secret').isConfigured,
      isTrue,
    );
  });
}
