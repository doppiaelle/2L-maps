import 'package:flutter/material.dart';
import 'package:here_sdk/core.dart';
import 'package:here_sdk/mapview.dart';

import 'position_adapter.dart';

class HereMapScreen extends StatefulWidget {
  const HereMapScreen({
    this.followPosition = false,
    this.userPosition,
    this.onRecenter,
    super.key,
  });

  final bool followPosition;
  final PositionFix? userPosition;
  final Future<void> Function()? onRecenter;

  @override
  State<HereMapScreen> createState() => _HereMapScreenState();
}

class _HereMapScreenState extends State<HereMapScreen> {
  HereMapController? _controller;
  LocationIndicator? _locationIndicator;

  MapScheme _scheme(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark
          ? MapScheme.normalNight
          : MapScheme.normalDay;

  void _onMapCreated(HereMapController controller) {
    _controller = controller;
    final locationIndicator = LocationIndicator()
      ..locationIndicatorStyle = LocationIndicatorIndicatorStyle.navigation
      ..isAccuracyVisualized = false;
    locationIndicator.enable(controller);
    _locationIndicator = locationIndicator;
    _updateLocationIndicator(widget.userPosition);

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
    if (widget.userPosition != oldWidget.userPosition) {
      _updateLocationIndicator(widget.userPosition);
    }
    if (!oldWidget.followPosition && widget.followPosition) {
      _follow(widget.userPosition);
    }
  }

  void _updateLocationIndicator(PositionFix? fix) {
    final indicator = _locationIndicator;
    if (indicator == null || fix == null) return;
    final location = Location.withCoordinates(
      GeoCoordinates(fix.latitude, fix.longitude),
    )
      ..time = fix.timestamp;
    final heading = fix.headingDegrees;
    if (heading != null) location.bearingInDegrees = heading;
    indicator.updateLocation(location);
  }

  void _follow(PositionFix? fix) {
    if (_controller == null || fix == null) return;
    _controller!.camera.lookAtPointWithMeasure(
      GeoCoordinates(fix.latitude, fix.longitude),
      MapMeasure(MapMeasureKind.distanceInMeters, 450),
    );
  }

  Future<void> _recenter() async {
    await widget.onRecenter?.call();
    if (!mounted) return;
    _follow(widget.userPosition);
  }

  @override
  Widget build(BuildContext context) => SizedBox.expand(
        child: Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: HereMap(onMapCreated: _onMapCreated),
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
                  tooltip: 'Ricentra sulla mia posizione',
                  icon: const Icon(Icons.my_location),
                  onPressed: _recenter,
                ),
              ),
            ),
          ],
        ),
      );
}
