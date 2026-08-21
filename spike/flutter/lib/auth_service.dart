import 'package:supabase_flutter/supabase_flutter.dart';

class AuthSessionController {
  AuthSessionController({SupabaseClient? client}) : _client = client ?? Supabase.instance.client;
  final SupabaseClient _client;
  Session? get session => _client.auth.currentSession;
  Stream<AuthState> get authStateChanges => _client.auth.onAuthStateChange;
  Future<void> signIn({required String email, required String password}) => _client.auth.signInWithPassword(email: email.trim(), password: password);
  Future<void> signUp({required String email, required String password}) => _client.auth.signUp(email: email.trim(), password: password);
  Future<bool> signInWithGoogle({required String redirectTo}) => _client.auth.signInWithOAuth(OAuthProvider.google, redirectTo: redirectTo, authScreenLaunchMode: LaunchMode.externalApplication);
  Future<void> signOut() => _client.auth.signOut();
}
