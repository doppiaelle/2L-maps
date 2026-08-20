import 'package:flutter/material.dart';
import 'package:here_sdk/core.dart';
import 'package:here_sdk/core.engine.dart';
import 'package:here_sdk/core.errors.dart';
import 'package:here_sdk/mapview.dart';

import 'spike_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  const config = SpikeConfig.fromEnvironment();

  if (!config.isConfigured) {
    runApp(const _ConfigurationMissingApp());
    return;
  }

  SdkContext.init(IsolateOrigin.main);
  final authenticationMode = AuthenticationMode.withKeySecret(
    config.accessKeyId,
    config.accessKeySecret,
  );
  final options = SDKOptions.withAuthenticationMode(authenticationMode);

  try {
    await SDKNativeEngine.makeSharedInstance(options);
  } on InstantiationException {
    runApp(const _ConfigurationMissingApp());
    return;
  }

  runApp(const HereSpikeApp());
}

class HereSpikeApp extends StatefulWidget {
  const HereSpikeApp({super.key});

  @override
  State<HereSpikeApp> createState() => _HereSpikeAppState();
}

class _HereSpikeAppState extends State<HereSpikeApp> {
  HereMapController? _mapController;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: '2L Maps HERE Spike',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF00F5D4)),
        ),
        home: Scaffold(
          appBar: AppBar(title: const Text('HERE Explore spike')),
          body: HereMap(onMapCreated: _onMapCreated),
        ),
      );

  void _onMapCreated(HereMapController controller) {
    _mapController = controller;
    controller.mapScene.loadSceneForMapScheme(
      MapScheme.normalDay,
      (MapError? error) {
        if (error != null) {
          debugPrint('HERE map scene failed: $error');
        }
      },
    );
  }

  @override
  void dispose() {
    _mapController = null;
    SDKNativeEngine.sharedInstance?.dispose();
    SdkContext.release();
    super.dispose();
  }
}

class _ConfigurationMissingApp extends StatelessWidget {
  const _ConfigurationMissingApp();

  @override
  Widget build(BuildContext context) => const MaterialApp(
        home: Scaffold(
          body: Center(
            child: Text(
              'HERE credentials are not configured for this spike build.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
}
