import 'package:flutter/material.dart';
import 'package:here_sdk/core.dart';
import 'package:here_sdk/mapview.dart';

import 'position_adapter.dart';

class HereMapScreen extends StatefulWidget {
  const HereMapScreen({
    this.followPosition = false,
    this.routeSummary,
    this.userPosition,
    this.height,
    super.key,
  });

  final bool followPosition;
  final String? routeSummary;
  final PositionFix? userPosition;
  final double? height;

  @override
  State<HereMapScreen> createState() => _HereMapScreenState();
}

class _HereMapScreenState extends State<HereMapScreen> {
  HereMapController? _controller;

  MapScheme _scheme(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark
          ? MapScheme.normalNight
          : MapScheme.normalDay;

  void _onMapCreated(HereMapController controller) {
    _controller = controller;
    controller.mapScene.loadSceneForMapScheme(_scheme(context), (error) {
      if (!mounted || error == null) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Mappa HERE non disponibile')),
      );
    });
    _follow(widget.userPosition);
  }

  @override
  void didUpdateWidget(covariant HereMapScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.followPosition && widget.userPosition != oldWidget.userPosition) {
      _follow(widget.userPosition);
    }
  }

  void _follow(PositionFix? fix) {
    if (_controller == null || fix == null || !widget.followPosition) return;
    final camera = _controller!.camera;
    camera.lookAtPointWithMeasure(
      GeoCoordinates(fix.latitude, fix.longitude),
      MapMeasure(MapMeasureKind.distanceInMeters, 450),
    );
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) {
          final mapHeight = widget.height ??
              (constraints.hasBoundedHeight && constraints.maxHeight.isFinite
                  ? constraints.maxHeight
                  : 420);
          return SizedBox(
            height: mapHeight,
        child: Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: HereMap(onMapCreated: _onMapCreated),
            ),
            if (widget.followPosition && widget.userPosition != null)
              Center(
                child: Transform.rotate(
                  angle: (widget.userPosition!.headingDegrees ?? 0) *
                      3.141592653589793 /
                      180,
                  child: DecoratedBox(
                    decoration: const BoxDecoration(
                      color: Color(0xFF00F5D4),
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: Color(0x6600F5D4),
                          blurRadius: 20,
                          spreadRadius: 8,
                        ),
                      ],
                    ),
                    child: const Padding(
                      padding: EdgeInsets.all(10),
                      child: Icon(Icons.navigation, color: Color(0xFF13201E)),
                    ),
                  ),
                ),
              ),
            Positioned(
              top: 12,
              right: 12,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .surface
                      .withValues(alpha: .92),
                  shape: BoxShape.circle,
                ),
                child: IconButton(
                  tooltip: widget.followPosition
                      ? 'Camera centrata'
                      : 'Panoramica itinerario',
                  icon: Icon(widget.followPosition
                      ? Icons.my_location
                      : Icons.fit_screen),
                  onPressed: () => _follow(widget.userPosition),
                ),
              ),
            ),
            if (widget.routeSummary != null)
              Positioned(
                left: 16,
                right: 16,
                bottom: 12,
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    child: Text(
                      widget.routeSummary!,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                ),
              ),
          ],
        ),
          );
        },
      );
}
