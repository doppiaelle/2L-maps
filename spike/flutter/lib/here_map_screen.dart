import 'package:flutter/material.dart';
import 'package:here_sdk/core.dart';
import 'package:here_sdk/mapview.dart';

import 'position_adapter.dart';

class HereMapScreen extends StatefulWidget {
  const HereMapScreen({
    this.followPosition = false,
    this.onRecenter,
    this.routeSummary,
    this.userPosition,
    this.height,
    super.key,
  });

  final bool followPosition;
  final Future<void> Function()? onRecenter;
  final String? routeSummary;
  final PositionFix? userPosition;
  final double? height;

  @override
  State<HereMapScreen> createState() => _HereMapScreenState();
}

class _HereMapScreenState extends State<HereMapScreen> {
  HereMapController? _controller;
  LocationIndicator? _locationIndicator;
  bool _locationIndicatorEnabled = false;

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
    _updateLocationIndicator(widget.userPosition);
    _follow(widget.userPosition);
  }

  @override
  void didUpdateWidget(covariant HereMapScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.followPosition != oldWidget.followPosition ||
        widget.userPosition != oldWidget.userPosition) {
      _updateLocationIndicator(widget.userPosition);
      if (!oldWidget.followPosition && widget.followPosition) {
        _follow(widget.userPosition);
      }
    }
  }

  void _ensureLocationIndicator() {
    if (_locationIndicator != null) return;
    final indicator = LocationIndicator();
    indicator.locationIndicatorStyle =
        LocationIndicatorIndicatorStyle.navigation;
    indicator.isAccuracyVisualized = false;
    _locationIndicator = indicator;
  }

  void _updateLocationIndicator(PositionFix? fix) {
    final controller = _controller;
    if (controller == null || fix == null) {
      if (_locationIndicatorEnabled) {
        _locationIndicator?.disable();
        _locationIndicatorEnabled = false;
      }
      return;
    }

    _ensureLocationIndicator();
    final location = Location.withCoordinates(
      GeoCoordinates(fix.latitude, fix.longitude),
    );
    location.time = fix.timestamp;
    if (fix.headingDegrees != null) {
      location.bearingInDegrees = fix.headingDegrees!;
    }
    _locationIndicator!.updateLocation(location);
    if (!_locationIndicatorEnabled) {
      _locationIndicator!.enable(controller);
      _locationIndicatorEnabled = true;
    }
  }

  void _follow(PositionFix? fix) {
    if (_controller == null || fix == null) return;
    final camera = _controller!.camera;
    camera.lookAtPointWithMeasure(
      GeoCoordinates(fix.latitude, fix.longitude),
      MapMeasure(MapMeasureKind.distanceInMeters, 450),
    );
  }

  Future<void> _recenter() async {
    await widget.onRecenter?.call();
    if (mounted) {
      _follow(widget.userPosition);
    }
  }

  @override
  void dispose() {
    if (_locationIndicatorEnabled) {
      _locationIndicator?.disable();
    }
    _locationIndicator = null;
    super.dispose();
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
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: Stack(
                children: [
                  HereMap(onMapCreated: _onMapCreated),
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
                        tooltip: 'Aggiorna posizione GPS',
                        icon: const Icon(Icons.my_location),
                        onPressed: _recenter,
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
            ),
          );
        },
      );
}
