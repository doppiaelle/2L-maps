import 'dart:async';

import 'package:flutter/material.dart';
import 'app_bootstrap.dart';
import 'app_theme.dart';
import 'here_map_screen.dart';
import 'location_tracking.dart';
import 'auth_screen.dart';
import 'auth_service.dart';
import 'app_diagnostics.dart';
import 'http_json_transport.dart';
import 'planner.dart';
import 'route_models.dart';
import 'route_orchestrator.dart';
import 'routing_config.dart';
import 'routing_transport.dart';
import 'search_transport.dart';
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
class _Shell extends StatefulWidget {
  const _Shell({required this.auth, required this.onTheme});

  final AuthSessionController auth;
  final ValueChanged<ThemeMode> onTheme;

  @override
  State<_Shell> createState() => _ShellState();
}

class _ShellState extends State<_Shell> {
  late final List<Widget> pages;
  int selectedIndex = 0;

  @override
  void initState() {
    super.initState();
    pages = [
      PlannerScreen(accessToken: widget.auth.session?.accessToken ?? ''),
      const HistoryScreen(),
      SettingsScreen(
        onTheme: widget.onTheme,
        onLogout: widget.auth.signOut,
      ),
      const NavigationScreen(),
    ];
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: IndexedStack(index: selectedIndex, children: pages),
        bottomNavigationBar: NavigationBar(
          selectedIndex: selectedIndex,
          onDestinationSelected: (index) =>
              setState(() => selectedIndex = index),
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.route),
              label: 'Planner',
            ),
            NavigationDestination(
              icon: Icon(Icons.history),
              label: 'Storico',
            ),
            NavigationDestination(
              icon: Icon(Icons.settings_outlined),
              label: 'Impostazioni',
            ),
            NavigationDestination(
              icon: Icon(Icons.navigation_outlined),
              label: 'Navigazione',
            ),
          ],
        ),
      );
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
      : _Shell(auth: auth, onTheme: widget.onTheme),
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
class PlannerScreen extends StatefulWidget {
  const PlannerScreen({required this.accessToken, super.key});

  final String accessToken;

  @override
  State<PlannerScreen> createState() => _PlannerScreenState();
}

class _PlannerScreenState extends State<PlannerScreen> {
  late final PlannerController planner;

  @override
  void initState() {
    super.initState();
    final config = RoutingConfig.fromEnvironment();
    final request = createJsonRequest();
    planner = PlannerController(
      search: SupabaseSearchClient(request, config: config),
      orchestrator: RouteOrchestrator(
        client: SupabaseRoutingClient(request, config: config),
      ),
    );
  }

  Future<void> optimize() async {
    final start = planner.start;
    if (start == null || !start.resolved ||
        planner.stops.any((stop) => !stop.resolved)) {
      _showMessage('Seleziona risultati validi per partenza e tappe.');
      return;
    }
    final route = [
      Stop(
        id: 'start',
        latitude: start.latitude!,
        longitude: start.longitude!,
        label: start.address,
      ),
      for (var i = 0; i < planner.stops.length; i++)
        Stop(
          id: 'stop-$i',
          latitude: planner.stops[i].latitude!,
          longitude: planner.stops[i].longitude!,
          label: planner.stops[i].address,
        ),
    ];
    final result = await planner.optimizeRoute(
      route,
      accessToken: widget.accessToken,
    );
    if (!mounted) return;
    _showMessage(
      result == null
          ? planner.optimizationError ?? 'Ottimizzazione non riuscita.'
          : 'Percorso calcolato: ${result.route.distanceMeters.round()} m.',
    );
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  void dispose() {
    planner.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _Page(
        title: 'Dove vuoi andare oggi?',
        subtitle: 'Cerca partenza e destinazioni per creare un itinerario.',
        icon: Icons.edit_location_alt_outlined,
        child: PlannerView(
          controller: planner,
          accessToken: widget.accessToken,
          onOptimize: optimize,
        ),
      );
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
        if (AuthSessionController.debugToolsEnabled) const Divider(),
        if (AuthSessionController.debugToolsEnabled)
          ListTile(
            leading: const Icon(Icons.article_outlined),
            title: const Text('Log diagnostico'),
            subtitle: const Text('Visualizza e copia gli ultimi eventi dell’app'),
            onTap: () async {
              final log = AppDiagnostics.snapshot;
              await showDialog<void>(
                context: context,
                builder: (dialogContext) => AlertDialog(
                  title: const Text('Log diagnostico'),
                  content: SizedBox(
                    width: double.maxFinite,
                    height: 420,
                    child: SingleChildScrollView(
                      child: SelectableText(
                        log.isEmpty ? 'Nessun evento registrato.' : log,
                      ),
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(dialogContext).pop(),
                      child: const Text('Chiudi'),
                    ),
                    FilledButton.icon(
                      onPressed: () async {
                        await AppDiagnostics.copyToClipboard();
                        if (!context.mounted) return;
                        Navigator.of(dialogContext).pop();
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Log copiato negli appunti.'),
                          ),
                        );
                      },
                      icon: const Icon(Icons.copy),
                      label: const Text('Copia'),
                    ),
                  ],
                ),
              );
            },
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
class NavigationScreen extends StatefulWidget {
  const NavigationScreen({super.key});

  @override
  State<NavigationScreen> createState() => _NavigationScreenState();
}

class _NavigationScreenState extends State<NavigationScreen>
    with WidgetsBindingObserver {
  late final LocationTrackingController tracking;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    tracking = LocationTrackingController(
      platform: const GeolocatorDeviceLocationPlatform(),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(tracking.start());
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      tracking.resume();
    } else if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      tracking.suspend();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    tracking.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: tracking,
        builder: (context, _) => _Page(
          title: 'Navigazione',
          subtitle: _subtitle,
          icon: Icons.navigation_outlined,
          scrollable: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: HereMapScreen(
                  followPosition: tracking.hasPosition,
                  userPosition: tracking.latest,
                  routeSummary: tracking.hasPosition
                      ? 'GPS attivo · precisione ${tracking.latest!.accuracyMeters.toStringAsFixed(0)} m'
                      : null,
                ),
              ),
              const SizedBox(height: 12),
              Flexible(
                child: Card(
                  child: ListTile(
                  leading: Icon(_statusIcon),
                  title: Text(_statusTitle),
                  subtitle: Text(tracking.message ??
                      (tracking.hasPosition
                          ? 'Posizione aggiornata in tempo reale.'
                          : 'La posizione iniziale non è ancora disponibile.')),
                    trailing: _action,
                  ),
                ),
              ),
            ],
          ),
        ),
      );

  String get _subtitle => tracking.hasPosition
      ? 'La mappa segue la tua posizione.'
      : 'Attiva il GPS per avviare la guida.';

  String get _statusTitle => switch (tracking.state) {
        LocationTrackingState.active => tracking.hasPosition
            ? 'Posizione rilevata'
            : 'Ricerca posizione GPS',
        LocationTrackingState.weakSignal => 'Segnale GPS debole',
        LocationTrackingState.serviceDisabled => 'GPS disattivato',
        LocationTrackingState.permissionDenied => 'Permesso negato',
        LocationTrackingState.permissionDeniedForever => 'Permesso bloccato',
        LocationTrackingState.suspended => 'Posizione sospesa',
        LocationTrackingState.error => 'GPS non disponibile',
        LocationTrackingState.requestingPermission => 'Richiesta permesso',
        LocationTrackingState.idle => 'GPS non attivo',
      };

  IconData get _statusIcon => switch (tracking.state) {
        LocationTrackingState.active => Icons.gps_fixed,
        LocationTrackingState.weakSignal => Icons.gps_not_fixed,
        LocationTrackingState.serviceDisabled => Icons.location_off,
        LocationTrackingState.permissionDenied ||
        LocationTrackingState.permissionDeniedForever => Icons.location_disabled,
        LocationTrackingState.suspended => Icons.pause_circle_outline,
        LocationTrackingState.error => Icons.error_outline,
        LocationTrackingState.requestingPermission => Icons.location_searching,
        LocationTrackingState.idle => Icons.gps_off,
      };

  Widget get _action {
    final needsSettings = tracking.state == LocationTrackingState.serviceDisabled ||
        tracking.state == LocationTrackingState.permissionDeniedForever;
    if (needsSettings) {
      return TextButton(
        onPressed: tracking.openSettingsForCurrentIssue,
        child: const Text('Impostazioni'),
      );
    }
    if (tracking.state == LocationTrackingState.requestingPermission) {
      return const SizedBox(
        width: 24,
        height: 24,
        child: Padding(
          padding: EdgeInsets.all(4),
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    return FilledButton(
      onPressed: tracking.start,
      child: Text(tracking.hasPosition ? 'Aggiorna' : 'Attiva GPS'),
    );
  }
}

class _Page extends StatelessWidget {
  const _Page({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.child,
    this.scrollable = true,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final Widget child;
  final bool scrollable;

  @override
  Widget build(BuildContext context) {
    final header = Row(
      children: [
        CircleAvatar(
          backgroundColor: AppColors.mint,
          child: Icon(icon, color: AppColors.ink),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.headlineSmall),
              Text(subtitle),
            ],
          ),
        ),
      ],
    );

    if (scrollable) {
      return SafeArea(
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                header,
                const SizedBox(height: 28),
                child,
              ],
            ),
          ),
        ),
      );
    }

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            header,
            const SizedBox(height: 16),
            Expanded(child: child),
          ],
        ),
      ),
    );
  }
}
