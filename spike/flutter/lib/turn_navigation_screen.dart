import 'package:flutter/material.dart';

import 'here_map_screen.dart';
import 'navigation_models.dart';
import 'position_adapter.dart';
import 'turn_navigation.dart';

class TurnNavigationScreen extends StatefulWidget {
  const TurnNavigationScreen({
    required this.route,
    this.userPosition,
    super.key,
  });

  final HereRouteResult route;
  final PositionFix? userPosition;

  @override
  State<TurnNavigationScreen> createState() => _TurnNavigationScreenState();
}

class _TurnNavigationScreenState extends State<TurnNavigationScreen> {
  late final TurnNavigationController controller;

  @override
  void initState() {
    super.initState();
    controller = TurnNavigationController();
  }

  @override
  void dispose() {
    controller.stop();
    super.dispose();
  }

  String _distance(double meters) => meters >= 1000
      ? '${(meters / 1000).toStringAsFixed(1)} km'
      : '${meters.round()} m';

  @override
  Widget build(BuildContext context) {
    final current = controller.currentInstruction;
    final next = controller.nextInstruction;
    final running = controller.status == TurnNavigationStatus.running;
    final paused = controller.status == TurnNavigationStatus.paused;
    final active = running || paused;
    return Stack(
      children: [
        HereMapScreen(
          followPosition: active,
          userPosition: widget.userPosition,
          routeSummary: active
              ? '${_distance(controller.distanceRemainingMeters)} rimanenti'
              : null,
        ),
        if (active)
          Positioned(
            left: 16,
            right: 16,
            bottom: 16,
            child: Card(
              color: Theme.of(context).colorScheme.surface.withValues(alpha: .96),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(current?.action ?? 'Prosegui',
                        style: Theme.of(context).textTheme.headlineSmall),
                    Text(current == null
                        ? 'Arrivo'
                        : '${_distance(current.distanceMeters)} alla prossima manovra'),
                    if (next != null)
                      Text('Dopo: ${next.action}',
                          style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: paused
                                ? () => setState(controller.resume)
                                : () => setState(controller.pause),
                            icon: Icon(paused ? Icons.play_arrow : Icons.pause),
                            label: Text(paused ? 'Riprendi' : 'Pausa'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton(
                          tooltip: 'Termina navigazione',
                          onPressed: () => setState(controller.stop),
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          )
        else
          Positioned(
            left: 16,
            right: 16,
            bottom: 16,
            child: FilledButton.icon(
              onPressed: () => setState(() => controller.start(widget.route)),
              icon: const Icon(Icons.navigation),
              label: const Text('Avvia navigazione'),
            ),
          ),
      ],
    );
  }
}
