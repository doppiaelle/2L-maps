import 'package:here_sdk/core.dart';
import 'package:here_sdk/core.engine.dart';
import 'package:here_sdk/core.errors.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AppBootstrapConfig {
  const AppBootstrapConfig({required this.hereAccessKeyId, required this.hereAccessKeySecret, required this.supabaseUrl, required this.supabaseAnonKey});
  final String hereAccessKeyId, hereAccessKeySecret, supabaseUrl, supabaseAnonKey;
  factory AppBootstrapConfig.fromEnvironment() => const AppBootstrapConfig(hereAccessKeyId: String.fromEnvironment('HERE_ACCESS_KEY_ID'), hereAccessKeySecret: String.fromEnvironment('HERE_ACCESS_KEY_SECRET'), supabaseUrl: String.fromEnvironment('SUPABASE_URL'), supabaseAnonKey: String.fromEnvironment('SUPABASE_ANON_KEY'));
  bool get isConfigured => hereAccessKeyId.isNotEmpty && hereAccessKeySecret.isNotEmpty && supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;
}
enum BootstrapStatus { ready, missingConfiguration, failed }
class AppBootstrapResult {
  const AppBootstrapResult({required this.status, required this.config, this.message});
  final BootstrapStatus status; final AppBootstrapConfig config; final String? message;
}
Future<AppBootstrapResult> bootstrapApp() async {
  final config=AppBootstrapConfig.fromEnvironment();
  if (!config.isConfigured) return AppBootstrapResult(status: BootstrapStatus.missingConfiguration, config: config, message: 'Configura Supabase e HERE tramite dart-define.');
  try { await Supabase.initialize(url: config.supabaseUrl, anonKey: config.supabaseAnonKey); SdkContext.init(IsolateOrigin.main); final auth=AuthenticationMode.withKeySecret(config.hereAccessKeyId, config.hereAccessKeySecret); await SDKNativeEngine.makeSharedInstance(SDKOptions.withAuthenticationMode(auth)); return AppBootstrapResult(status: BootstrapStatus.ready, config: config); } on InstantiationException catch (e) { return AppBootstrapResult(status: BootstrapStatus.failed, config: config, message: 'Impossibile inizializzare HERE: $e'); } catch (e) { return AppBootstrapResult(status: BootstrapStatus.failed, config: config, message: 'Impossibile inizializzare i servizi: $e'); }
}
void disposeBootstrap(){SDKNativeEngine.sharedInstance?.dispose(); SdkContext.release();}
