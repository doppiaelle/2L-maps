class RoutingConfig {
  const RoutingConfig({required this.orsApiKey, required this.hereApiKey});
  final String orsApiKey;
  final String hereApiKey;

  bool get isConfigured => orsApiKey.isNotEmpty && hereApiKey.isNotEmpty;

  factory RoutingConfig.fromEnvironment() => const RoutingConfig(
        orsApiKey: String.fromEnvironment('ORS_API_KEY'),
        hereApiKey: String.fromEnvironment('HERE_REST_API_KEY'),
      );
}
