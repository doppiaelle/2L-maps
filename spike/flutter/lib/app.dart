import 'package:flutter/material.dart';
import 'app_bootstrap.dart';
import 'app_theme.dart';
import 'here_map_screen.dart';
import 'auth_screen.dart';
import 'auth_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class TwolMapsApp extends StatefulWidget {
  const TwolMapsApp({required this.bootstrap, super.key});
  final AppBootstrapResult bootstrap;
  @override State<TwolMapsApp> createState() => _TwolMapsAppState();
}
class _TwolMapsAppState extends State<TwolMapsApp> {
  ThemeMode mode = ThemeMode.light;
  int index = 0;
  @override Widget build(BuildContext context) => MaterialApp(title: '2L Maps', theme: AppTheme.light(), darkTheme: AppTheme.dark(), themeMode: mode,
    home: widget.bootstrap.status == BootstrapStatus.ready ? _AuthGate(onTheme: (m) => setState(() => mode = m)) : ConfigurationScreen(result: widget.bootstrap));
  @override void dispose() { if (widget.bootstrap.status == BootstrapStatus.ready) disposeBootstrap(); super.dispose(); }
}
class _Shell extends StatelessWidget {
  const _Shell({required this.index, required this.onIndex, required this.onTheme, this.onLogout});
  final int index; final ValueChanged<int> onIndex; final ValueChanged<ThemeMode> onTheme; final Future<void> Function()? onLogout;
  @override Widget build(BuildContext context) {
    final pages = [const PlannerScreen(), const HistoryScreen(), SettingsScreen(onTheme: onTheme, onLogout: onLogout), const NavigationScreen()];
    return Scaffold(body: IndexedStack(index: index, children: pages), bottomNavigationBar: NavigationBar(selectedIndex: index, onDestinationSelected: onIndex, destinations: const [
      NavigationDestination(icon: Icon(Icons.route), label: 'Planner'), NavigationDestination(icon: Icon(Icons.history), label: 'Storico'),
      NavigationDestination(icon: Icon(Icons.settings_outlined), label: 'Impostazioni'), NavigationDestination(icon: Icon(Icons.navigation_outlined), label: 'Navigazione'),
    ]));
  }
}
class _AuthGate extends StatefulWidget {
  const _AuthGate({required this.onTheme});
  final ValueChanged<ThemeMode> onTheme;
  @override State<_AuthGate> createState() => _AuthGateState();
}
class _AuthGateState extends State<_AuthGate> {
  late final AuthSessionController auth;
  @override void initState() { super.initState(); auth = AuthSessionController(); }
  @override Widget build(BuildContext context) => StreamBuilder<AuthState>(
    stream: auth.authStateChanges,
    initialData: AuthState(AuthChangeEvent.initialSession, auth.session),
    builder: (context, snapshot) => snapshot.data?.session == null
      ? AuthScreen(auth: auth)
      : _Shell(index: 0, onIndex: (_) {}, onTheme: widget.onTheme, onLogout: auth.signOut),
  );
}

class ConfigurationScreen extends StatelessWidget {
  const ConfigurationScreen({required this.result, super.key});
  final AppBootstrapResult result;
  @override Widget build(BuildContext context) => Scaffold(body: Center(child: Padding(padding: const EdgeInsets.all(32), child: Card(child: Padding(padding: const EdgeInsets.all(28), child: Column(mainAxisSize: MainAxisSize.min, children: [
    const Icon(Icons.tune, size: 48), const SizedBox(height: 20),
    Text(result.status == BootstrapStatus.missingConfiguration ? 'Configurazione necessaria' : 'Servizio non disponibile'),
    const SizedBox(height: 12), Text(result.message ?? 'Controlla la configurazione di build.', textAlign: TextAlign.center),
  ]))))));
}
class PlannerScreen extends StatelessWidget {
  const PlannerScreen({super.key});
  @override Widget build(BuildContext context) => const _Page(title: 'Dove vuoi andare oggi?', subtitle: 'Crea un itinerario ottimizzato in pochi passi.', icon: Icons.edit_location_alt_outlined, child: Column(children: [
    TextField(decoration: InputDecoration(labelText: 'Posizione di partenza', hintText: 'La tua posizione attuale', prefixIcon: Icon(Icons.my_location_outlined))),
    SizedBox(height: 12), TextField(decoration: InputDecoration(labelText: 'Prima destinazione', hintText: 'Cerca un indirizzo', prefixIcon: Icon(Icons.place_outlined))),
    SizedBox(height: 20), FilledButton(onPressed: null, child: Text('Ottimizza itinerario')),
  ]));
}
class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});
  @override Widget build(BuildContext context) => const _Page(title: 'I tuoi itinerari', subtitle: 'Gli itinerari salvati appariranno qui.', icon: Icons.history, child: Card(child: Padding(padding: EdgeInsets.all(40), child: Text('Nessun itinerario salvato'))));
}
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({required this.onTheme, this.onLogout, super.key});
  final ValueChanged<ThemeMode> onTheme;
  final Future<void> Function()? onLogout;
  @override
  Widget build(BuildContext context) => _Page(
    title: 'Impostazioni',
    subtitle: 'Preferenze dell’app e configurazione.',
    icon: Icons.settings_outlined,
    child: Card(
      child: Column(children: [
        ListTile(
          title: const Text('Tema'),
          trailing: DropdownButton<ThemeMode>(
            value: ThemeMode.light,
            items: const [
              DropdownMenuItem(value: ThemeMode.light, child: Text('Chiaro')),
              DropdownMenuItem(value: ThemeMode.dark, child: Text('Scuro')),
            ],
            onChanged: (m) { if (m != null) onTheme(m); },
          ),
        ),
        if (onLogout != null) const Divider(),
        if (onLogout != null)
          ListTile(
            leading: const Icon(Icons.logout),
            title: const Text('Esci'),
            onTap: onLogout,
          ),
      ]),
    ),
  );
}
class NavigationScreen extends StatelessWidget {
  const NavigationScreen({super.key});
  @override Widget build(BuildContext context) => const _Page(title: 'Navigazione', subtitle: 'La guida turn-by-turn apparirà qui.', icon: Icons.navigation_outlined, child: HereMapScreen());
}
class _Page extends StatelessWidget {
  const _Page({required this.title, required this.subtitle, required this.icon, required this.child});
  final String title, subtitle; final IconData icon; final Widget child;
  @override Widget build(BuildContext context) => SafeArea(child: SingleChildScrollView(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
    Row(children: [CircleAvatar(backgroundColor: AppColors.mint, child: Icon(icon, color: AppColors.ink)), const SizedBox(width: 12), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: Theme.of(context).textTheme.headlineSmall), Text(subtitle)]))]),
    const SizedBox(height: 28), child,
  ])));
}
