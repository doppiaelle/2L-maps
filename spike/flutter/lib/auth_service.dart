import 'package:supabase_flutter/supabase_flutter.dart';

import 'app_diagnostics.dart';

class AuthSessionController {
  AuthSessionController({SupabaseClient? client})
      : _client = client ?? Supabase.instance.client;

  static const redirectUri = 'twolmaps://auth-callback';
  static const debugToolsEnabled = bool.fromEnvironment(
    'DEBUG_AUTH_BYPASS',
    defaultValue: false,
  );

  final SupabaseClient _client;

  Session? get session => _client.auth.currentSession;

  Stream<AuthState> get authStateChanges =>
      _client.auth.onAuthStateChange.map((state) {
        AppDiagnostics.record(
          'auth event=${state.event} session=${state.session != null}',
        );
        return state;
      });

  Future<AuthResponse> signIn({
    required String email,
    required String password,
  }) async {
    AppDiagnostics.record('password sign-in requested');
    final response = await _client.auth.signInWithPassword(
      email: email.trim(),
      password: password,
    );
    AppDiagnostics.record(
      'password sign-in completed session=${response.session != null}',
    );
    return response;
  }

  Future<AuthResponse> signUp({
    required String email,
    required String password,
  }) async {
    AppDiagnostics.record('password sign-up requested');
    final response = await _client.auth.signUp(
      email: email.trim(),
      password: password,
      emailRedirectTo: redirectUri,
    );
    AppDiagnostics.record(
      'password sign-up completed user=${response.user != null} '
      'session=${response.session != null}',
    );
    return response;
  }

  Future<bool> signInWithGoogle({
    String redirectTo = redirectUri,
  }) async {
    AppDiagnostics.record('google oauth requested redirect=$redirectTo');
    final started = await _client.auth.signInWithOAuth(
      OAuthProvider.google,
      redirectTo: redirectTo,
      authScreenLaunchMode: LaunchMode.externalApplication,
    );
    AppDiagnostics.record('google oauth browser started=$started');
    return started;
  }

  Future<AuthResponse> signInAnonymously() async {
    AppDiagnostics.record('anonymous debug sign-in requested');
    final response = await _client.auth.signInAnonymously();
    AppDiagnostics.record(
      'anonymous debug sign-in completed session=${response.session != null}',
    );
    return response;
  }

  Future<void> signOut() async {
    AppDiagnostics.record('sign-out requested');
    await _client.auth.signOut();
    AppDiagnostics.record('sign-out completed');
  }
}