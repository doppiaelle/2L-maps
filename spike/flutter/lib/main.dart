import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'app.dart';
import 'app_bootstrap.dart';
import 'app_diagnostics.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  FlutterError.onError = (details) {
    final message = details.exceptionAsString().split('\n').first;
    AppDiagnostics.record(
      'flutter_error type=${details.exception.runtimeType} message=${AppDiagnostics.sanitize(message)}',
    );
    FlutterError.presentError(details);
  };

  ui.PlatformDispatcher.instance.onError = (error, stack) {
    AppDiagnostics.record(
      'uncaught_error type=${error.runtimeType} message=${AppDiagnostics.sanitize(error.toString())}',
    );
    return false;
  };

  AppDiagnostics.record('bootstrap_started');
  final bootstrap = await bootstrapApp();
  AppDiagnostics.record(
    'bootstrap_completed status=${bootstrap.status}',
  );
  runApp(TwolMapsApp(bootstrap: bootstrap));
}
