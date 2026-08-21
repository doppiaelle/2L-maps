import 'package:flutter/material.dart';
import 'app.dart';
import 'app_bootstrap.dart';
Future<void> main() async { WidgetsFlutterBinding.ensureInitialized(); final bootstrap=await bootstrapApp(); runApp(TwolMapsApp(bootstrap:bootstrap)); }
