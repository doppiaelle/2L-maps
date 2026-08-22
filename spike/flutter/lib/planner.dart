import 'dart:async';

import 'package:flutter/material.dart';

import 'route_models.dart';
import 'route_orchestrator.dart';
import 'routing_transport.dart';
import 'search_transport.dart';

class PlannerStop {
  PlannerStop({
    required this.address,
    this.label = '',
    this.note = '',
    this.latitude,
    this.longitude,
  });

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

  Future<ServerNavigationPlan?> optimizeRoute(
    List<Stop> route, {
    required String accessToken,
  }) async {
    final service = orchestrator;
    if (service == null) {
      optimizationError = 'Ottimizzazione non configurata.';
      notifyListeners();
      return null;
    }
    if (optimizing) return plan;
    if (route.length < 3 || route.length > maxStops) {
      optimizationError = 'L’itinerario deve contenere da 3 a $maxStops punti.';
      notifyListeners();
      return null;
    }
    final request = ++_optimizationRequest;
    optimizing = true;
    optimizationError = null;
    notifyListeners();
    try {
      final result = await service.buildPlan(route, accessToken: accessToken);
      if (request == _optimizationRequest) plan = result;
      return result;
    } catch (error) {
      if (request == _optimizationRequest) {
        optimizationError = error is StateError
            ? error.message
            : 'Impossibile calcolare il percorso.';
      }
      return null;
    } finally {
      if (request == _optimizationRequest) {
        optimizing = false;
        notifyListeners();
      }
    }
  }

  void setGps({
    required bool available,
    required bool permissionGranted,
    double? latitude,
    double? longitude,
  }) {
    gpsAvailable = available;
    locationPermissionGranted = permissionGranted;
    start ??= PlannerStop(
      address: available ? 'La mia posizione' : 'Seleziona una partenza',
      latitude: latitude,
      longitude: longitude,
    );
    notifyListeners();
  }

  void setStart(
    String address, {
    double? latitude,
    double? longitude,
  }) {
    start = PlannerStop(
      address: address,
      latitude: latitude,
      longitude: longitude,
    );
    notifyListeners();
  }

  void addStop(String address, {double? latitude, double? longitude}) {
    if (!canAddStop) {
      error = 'Puoi inserire al massimo $maxStops tappe.';
      notifyListeners();
      return;
    }
    stops.add(
      PlannerStop(
        address: address,
        latitude: latitude,
        longitude: longitude,
      ),
    );
    notifyListeners();
  }

  void clearSuggestions() {
    suggestions = [];
    searching = false;
    error = null;
    notifyListeners();
  }

  void updateStop(int index, PlannerStop value) {
    if (index >= 0 && index < stops.length) {
      stops[index] = value;
      notifyListeners();
    }
  }

  void removeStop(int index) {
    if (index >= 0 && index < stops.length) {
      stops.removeAt(index);
      notifyListeners();
    }
  }

  void reorder(int oldIndex, int newIndex) {
    if (newIndex > oldIndex) newIndex--;
    final item = stops.removeAt(oldIndex);
    stops.insert(newIndex, item);
    notifyListeners();
  }

  void setReturnToStart(bool value) {
    returnToStart = value;
    notifyListeners();
  }

  void query(
    String value, {
    double? latitude,
    double? longitude,
    required String accessToken,
  }) {
    _debounce?.cancel();
    final query = value.trim();
    final id = ++_requestId;
    if (query.length < 2) {
      suggestions = [];
      searching = false;
      error = null;
      notifyListeners();
      return;
    }
    searching = true;
    error = null;
    notifyListeners();
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      try {
        final result = await search.suggest(
          query,
          accessToken: accessToken,
          latitude: latitude,
          longitude: longitude,
        );
        if (id != _requestId) return;
        suggestions = result;
        error = result.isEmpty ? 'Nessun indirizzo trovato.' : null;
      } catch (error) {
        if (id == _requestId) {
          suggestions = [];
          this.error = 'Ricerca indirizzi non disponibile.';
        }
      }
      if (id == _requestId) {
        searching = false;
        notifyListeners();
      }
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }
}

class PlannerView extends StatefulWidget {
  const PlannerView({
    required this.controller,
    required this.accessToken,
    this.onOptimize,
    super.key,
  });

  final PlannerController controller;
  final String accessToken;
  final Future<void> Function()? onOptimize;

  @override
  State<PlannerView> createState() => _PlannerViewState();
}

class _PlannerViewState extends State<PlannerView> {
  final start = TextEditingController();
  final destination = TextEditingController();
  bool editingStart = true;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_changed);
    final currentStart = widget.controller.start;
    if (currentStart != null) start.text = currentStart.address;
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  void _select(AddressSuggestion suggestion) {
    if (editingStart) {
      start.text = suggestion.address;
      widget.controller.setStart(
        suggestion.address,
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
      );
    } else {
      widget.controller.addStop(
        suggestion.address,
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
      );
      destination.clear();
    }
    widget.controller.clearSuggestions();
  }

  Widget _searchField(
    TextEditingController controller, {
    required String label,
    required bool isStart,
  }) {
    return TextField(
      controller: controller,
      onTap: () => setState(() => editingStart = isStart),
      onChanged: (value) {
        editingStart = isStart;
        widget.controller.query(value, accessToken: widget.accessToken);
      },
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(isStart ? Icons.my_location_outlined : Icons.search),
      ),
    );
  }

  @override
  void dispose() {
    widget.controller.removeListener(_changed);
    start.dispose();
    destination.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _searchField(
            start,
            label: 'Cerca partenza',
            isStart: true,
          ),
          const SizedBox(height: 12),
          _searchField(
            destination,
            label: 'Cerca destinazione',
            isStart: false,
          ),
          if (widget.controller.searching)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: LinearProgressIndicator(),
            ),
          if (widget.controller.suggestions.isNotEmpty)
            Card(
              margin: const EdgeInsets.only(top: 8),
              child: Column(
                children: [
                  for (final suggestion in widget.controller.suggestions)
                    ListTile(
                      leading: const Icon(Icons.place_outlined),
                      title: Text(suggestion.address),
                      onTap: () => _select(suggestion),
                    ),
                ],
              ),
            ),
          if (widget.controller.error != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                widget.controller.error!,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.error,
                ),
              ),
            ),
          if (widget.controller.start != null) ...[
            const SizedBox(height: 16),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.trip_origin),
              title: Text(widget.controller.start!.address),
              subtitle: const Text('Partenza selezionata'),
            ),
          ],
          ReorderableListView(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            onReorder: widget.controller.reorder,
            children: [
              for (var i = 0; i < widget.controller.stops.length; i++)
                ListTile(
                  key: ValueKey(widget.controller.stops[i]),
                  leading: const Icon(Icons.drag_handle),
                  title: Text(widget.controller.stops[i].address),
                  subtitle: const Text('Tappa selezionata'),
                  trailing: IconButton(
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () => widget.controller.removeStop(i),
                  ),
                ),
            ],
          ),
          SwitchListTile(
            title: const Text('Ritorna alla partenza'),
            value: widget.controller.returnToStart,
            onChanged: widget.controller.setReturnToStart,
          ),
          FilledButton.icon(
            onPressed: widget.onOptimize == null ||
                    widget.controller.start == null ||
                    widget.controller.stops.isEmpty
                ? null
                : widget.onOptimize,
            icon: const Icon(Icons.route),
            label: const Text('Ottimizza itinerario'),
          ),
        ],
      );
}