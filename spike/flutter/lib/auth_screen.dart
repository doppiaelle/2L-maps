import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app_diagnostics.dart';
import 'auth_service.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({required this.auth, super.key});

  final AuthSessionController auth;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool register = false;
  bool busy = false;
  String? feedback;
  bool feedbackIsError = false;

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  void setFeedback(String message, {bool isError = false}) {
    if (!mounted) return;
    setState(() {
      feedback = message;
      feedbackIsError = isError;
    });
  }

  Future<void> submit() async {
    final normalizedEmail = email.text.trim();
    if (!normalizedEmail.contains('@')) {
      setFeedback('Inserisci un indirizzo email valido.', isError: true);
      return;
    }
    if (password.text.length < 6) {
      setFeedback('La password deve contenere almeno 6 caratteri.', isError: true);
      return;
    }

    setState(() {
      busy = true;
      feedback = null;
    });
    try {
      final response = register
          ? await widget.auth.signUp(
              email: normalizedEmail,
              password: password.text,
            )
          : await widget.auth.signIn(
              email: normalizedEmail,
              password: password.text,
            );
      if (register && response.session == null) {
        setFeedback(
          'Account creato. Controlla la tua email e conferma l’account prima di accedere.',
        );
      } else if (register) {
        setFeedback('Account creato e accesso effettuato.');
      }
    } on AuthException catch (e) {
      AppDiagnostics.record('auth error status=${e.statusCode ?? 'unknown'}');
      setFeedback(e.message, isError: true);
    } catch (e) {
      AppDiagnostics.record('unexpected auth error type=${e.runtimeType}');
      setFeedback('Autenticazione non disponibile: $e', isError: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> google() async {
    setState(() {
      busy = true;
      feedback = null;
    });
    try {
      final started = await widget.auth.signInWithGoogle();
      if (!started) {
        setFeedback('Impossibile aprire il flusso Google.', isError: true);
      }
    } on AuthException catch (e) {
      AppDiagnostics.record('google auth error status=${e.statusCode ?? 'unknown'}');
      setFeedback(e.message, isError: true);
    } catch (e) {
      AppDiagnostics.record('unexpected google error type=${e.runtimeType}');
      setFeedback('Accesso Google non disponibile: $e', isError: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> debugAccess() async {
    setState(() {
      busy = true;
      feedback = null;
    });
    try {
      final response = await widget.auth.signInAnonymously();
      if (response.session == null) {
        setFeedback('Supabase non ha restituito una sessione debug.', isError: true);
      }
    } on AuthException catch (e) {
      AppDiagnostics.record('anonymous auth error status=${e.statusCode ?? 'unknown'}');
      setFeedback(e.message, isError: true);
    } catch (e) {
      AppDiagnostics.record('unexpected anonymous error type=${e.runtimeType}');
      setFeedback('Accesso debug non disponibile: $e', isError: true);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> copyDiagnostics() async {
    await AppDiagnostics.copyToClipboard();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Diagnostica copiata negli appunti.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(Icons.route, size: 52, color: colors.primary),
                    const SizedBox(height: 16),
                    Text(
                      register ? 'Crea il tuo account' : 'Accedi a 2L Maps',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 20),
                    TextField(
                      controller: email,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(labelText: 'Email'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: password,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Password'),
                    ),
                    if (feedback != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        feedback!,
                        style: TextStyle(
                          color: feedbackIsError ? colors.error : Colors.green,
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: busy ? null : submit,
                      child: Text(register ? 'Registrati' : 'Accedi'),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: busy ? null : google,
                      icon: const Icon(Icons.login),
                      label: const Text('Continua con Google'),
                    ),
                    TextButton(
                      onPressed: busy
                          ? null
                          : () => setState(() {
                              register = !register;
                              feedback = null;
                            }),
                      child: Text(
                        register ? 'Hai già un account? Accedi' : 'Crea un account',
                      ),
                    ),
                    if (AuthSessionController.debugToolsEnabled) ...[
                      const Divider(height: 24),
                      OutlinedButton.icon(
                        onPressed: busy ? null : debugAccess,
                        icon: const Icon(Icons.bug_report_outlined),
                        label: const Text('Accesso debug anonimo'),
                      ),
                      TextButton.icon(
                        onPressed: busy ? null : copyDiagnostics,
                        icon: const Icon(Icons.copy_all_outlined),
                        label: const Text('Copia diagnostica'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}