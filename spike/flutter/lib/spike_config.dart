class SpikeConfig {
  const SpikeConfig({
    required this.accessKeyId,
    required this.accessKeySecret,
  });

  final String accessKeyId;
  final String accessKeySecret;

  bool get isConfigured =>
      accessKeyId.trim().isNotEmpty && accessKeySecret.trim().isNotEmpty;

  factory SpikeConfig.fromEnvironment() => const SpikeConfig(
        accessKeyId: String.fromEnvironment('HERE_ACCESS_KEY_ID'),
        accessKeySecret: String.fromEnvironment('HERE_ACCESS_KEY_SECRET'),
      );
}
