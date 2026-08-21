import 'dart:async';
import 'package:flutter/material.dart';
import 'search_transport.dart';
import 'route_models.dart';
import 'route_orchestrator.dart';
import 'routing_transport.dart';

class PlannerStop {
  PlannerStop({required this.address, this.label = '', this.note = '', this.latitude, this.longitude});
  String address;
  String label;
  String note;
  double? latitude;
  double? longitude;
  bool get resolved => latitude != null && longitude != null;
}

class PlannerController extends ChangeNotifier {
  PlannerController({required this.search, this.orchestrator, this.maxStops = 25});
  final SupabaseSearchClient search;
  final RouteOrchestrator? orchestrator;
  final int maxStops;
  final List<PlannerStop> stops = [];
  PlannerStop? start;
  bool returnToStart = false;
  bool gpsAvailable = false;
  bool locationPermissionGranted = false;
  bool searching = false;
  String? error;
  List<AddressSuggestion> suggestions = [];
  Timer? _debounce;
  int _requestId = 0;
  bool optimizing = false;
  ServerNavigationPlan? plan;
  String? optimizationError;
  int _optimizationRequest = 0;

  bool get canAddStop => stops.length < maxStops;
  Future<ServerNavigationPlan?> optimizeRoute(List<Stop> route, {required String accessToken}) async {
    final service = orchestrator;
    if (service == null) { optimizationError = 'Ottimizzazione non configurata.'; notifyListeners(); return null; }
    if (optimizing) return plan;
    if (route.length < 3 || route.length > maxStops) {
      optimizationError = 'L’itinerario deve contenere da 3 a $maxStops punti.';
      notifyListeners(); return null;
    }
    final request = ++_optimizationRequest;
    optimizing = true; optimizationError = null; notifyListeners();
    try {
      final result = await service.buildPlan(route, accessToken: accessToken);
      if (request == _optimizationRequest) plan = result;
      return result;
    } catch (error) {
      if (request == _optimizationRequest) optimizationError = error is StateError ? error.message : 'Impossibile calcolare il percorso.';
      return null;
    } finally {
      if (request == _optimizationRequest) { optimizing = false; notifyListeners(); }
    }
  }

  void setGps({required bool available, required bool permissionGranted, double? latitude, double? longitude}) {
    gpsAvailable = available; locationPermissionGranted = permissionGranted;
    start ??= PlannerStop(address: available ? 'La mia posizione' : 'Seleziona una partenza', latitude: latitude, longitude: longitude);
    notifyListeners();
  }
  void addStop(String address, {double? latitude, double? longitude}) {
    if (!canAddStop) { error = 'Puoi inserire al massimo $maxStops tappe.'; notifyListeners(); return; }
    stops.add(PlannerStop(address: address, latitude: latitude, longitude: longitude)); notifyListeners();
  }
  void updateStop(int index, PlannerStop value) { if (index >= 0 && index < stops.length) { stops[index] = value; notifyListeners(); } }
  void removeStop(int index) { if (index >= 0 && index < stops.length) { stops.removeAt(index); notifyListeners(); } }
  void reorder(int oldIndex, int newIndex) { if (newIndex > oldIndex) newIndex--; final item = stops.removeAt(oldIndex); stops.insert(newIndex, item); notifyListeners(); }
  void setReturnToStart(bool value) { returnToStart = value; notifyListeners(); }
  void query(String value, {double? latitude, double? longitude, required String accessToken}) {
    _debounce?.cancel(); final query = value.trim(); final id = ++_requestId;
    if (query.length < 2) { suggestions = []; searching = false; notifyListeners(); return; }
    searching = true; error = null; notifyListeners();
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      try {
        final result = await search.suggest(query, accessToken: accessToken, latitude: latitude, longitude: longitude);
        if (id != _requestId) return;
        suggestions = result; error = result.isEmpty ? 'Nessun indirizzo trovato.' : null;
      } catch (_) { if (id == _requestId) { suggestions = []; error = 'Ricerca indirizzi non disponibile.'; } }
      if (id == _requestId) { searching = false; notifyListeners(); }
    });
  }
  @override void dispose() { _debounce?.cancel(); super.dispose(); }
}

class PlannerView extends StatefulWidget {
  const PlannerView({required this.controller, required this.accessToken, super.key});
  final PlannerController controller;
  final String accessToken;
  @override State<PlannerView> createState() => _PlannerViewState();
}
class _PlannerViewState extends State<PlannerView> {
  final destination = TextEditingController();
  @override void initState() { super.initState(); widget.controller.addListener(_changed); }
  void _changed() => setState(() {});
  @override void dispose() { widget.controller.removeListener(_changed); destination.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
    if (!widget.controller.locationPermissionGranted) Card(child: ListTile(leading: const Icon(Icons.location_off), title: const Text('Posizione non disponibile'), subtitle: const Text('Consenti il GPS o inserisci una partenza manuale.'))),
    TextField(controller: destination, onChanged: (v) => widget.controller.query(v, accessToken: widget.accessToken), decoration: const InputDecoration(labelText: 'Cerca destinazione', prefixIcon: Icon(Icons.search))),
    if (widget.controller.searching) const LinearProgressIndicator(),
    ...widget.controller.suggestions.map((s) => ListTile(title: Text(s.address), onTap: () { widget.controller.addStop(s.address, latitude: s.latitude, longitude: s.longitude); destination.clear(); widget.controller.suggestions = []; widget.controller.notifyListeners(); })),
    if (widget.controller.error != null) Text(widget.controller.error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
    ReorderableListView(shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), onReorder: widget.controller.reorder, children: [
      for (var i = 0; i < widget.controller.stops.length; i++) ListTile(key: ValueKey(widget.controller.stops[i]), leading: const Icon(Icons.drag_handle), title: Text(widget.controller.stops[i].address), trailing: IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => widget.controller.removeStop(i))),
    ]),
    SwitchListTile(title: const Text('Ritorna alla partenza'), value: widget.controller.returnToStart, onChanged: widget.controller.setReturnToStart),
    FilledButton(onPressed: widget.controller.stops.isEmpty ? null : () {}, child: const Text('Ottimizza itinerario')),
  ]);
}
