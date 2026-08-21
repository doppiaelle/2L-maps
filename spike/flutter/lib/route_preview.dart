import 'package:flutter/material.dart';

import 'navigation_models.dart';

class RoutePreview extends StatelessWidget {
  const RoutePreview({
    super.key,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.nextInstruction,
    this.onOpenExternalNavigator,
  });

  final double distanceMeters;
  final double durationSeconds;
  final NavigationInstruction? nextInstruction;
  final VoidCallback? onOpenExternalNavigator;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      color: const Color(0xFFF7F8FA),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Your Route', style: theme.textTheme.titleLarge),
            const SizedBox(height: 12),
            Text('${(distanceMeters / 1000).toStringAsFixed(1)} km'),
            Text('${(durationSeconds / 60).round()} min'),
            if (nextInstruction != null) ...[
              const SizedBox(height: 16),
              Text(nextInstruction!.action, style: theme.textTheme.titleMedium),
              Text('in ${nextInstruction!.distanceMeters.round()} m'),
            ],
            Align(
              alignment: Alignment.centerRight,
              child: IconButton(
                tooltip: 'Open current stop in external navigator',
                onPressed: onOpenExternalNavigator,
                icon: const Icon(Icons.open_in_new),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
