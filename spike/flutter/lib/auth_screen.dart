import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'auth_service.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({required this.auth, super.key});
  final AuthSessionController auth;
  @override State<AuthScreen> createState() => _AuthScreenState();
}
class _AuthScreenState extends State<AuthScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool register = false, busy = false;
  String? error;
  @override void dispose() { email.dispose(); password.dispose(); super.dispose(); }
  Future<void> submit() async {
    setState(() { busy = true; error = null; });
    try {
      if (register) { await widget.auth.signUp(email: email.text, password: password.text); }
      else { await widget.auth.signIn(email: email.text, password: password.text); }
    } on AuthException catch (e) { if (mounted) setState(() => error = e.message); }
    catch (_) { if (mounted) setState(() => error = 'Autenticazione non disponibile.'); }
    finally { if (mounted) setState(() => busy = false); }
  }
  Future<void> google() async {
    setState(() { busy = true; error = null; });
    try { await widget.auth.signInWithGoogle(redirectTo: 'com.doppiaelle.twolmaps://login-callback/'); }
    on AuthException catch (e) { if (mounted) setState(() => error = e.message); }
    catch (_) { if (mounted) setState(() => error = 'Accesso Google non disponibile.'); }
    finally { if (mounted) setState(() => busy = false); }
  }
  @override Widget build(BuildContext context) {
    return Scaffold(
      body: Center(child: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: Card(child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Icon(Icons.route, size: 52, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 16),
              Text(register ? 'Crea il tuo account' : 'Accedi a 2L Maps', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 20),
              TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')),
              const SizedBox(height: 12),
              TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
              if (error != null) ...[const SizedBox(height: 12), Text(error!, style: const TextStyle(color: Colors.red))],
              const SizedBox(height: 20),
              FilledButton(onPressed: busy ? null : submit, child: Text(register ? 'Registrati' : 'Accedi')),
              const SizedBox(height: 8),
              OutlinedButton.icon(onPressed: busy ? null : google, icon: const Icon(Icons.login), label: const Text('Continua con Google')),
              TextButton(onPressed: busy ? null : () => setState(() { register = !register; error = null; }), child: Text(register ? 'Hai già un account? Accedi' : 'Crea un account')),
            ]),
          )),
        ),
      )),
    );
  }
}
