import 'package:flutter/material.dart';
import 'package:here_sdk/mapview.dart';

class HereMapScreen extends StatefulWidget {
  const HereMapScreen({this.followPosition = false, this.routeSummary, super.key});
  final bool followPosition;
  final String? routeSummary;
  @override State<HereMapScreen> createState() => _HereMapScreenState();
}
class _HereMapScreenState extends State<HereMapScreen> {
  MapScheme _scheme(BuildContext context) => Theme.of(context).brightness == Brightness.dark ? MapScheme.normalNight : MapScheme.normalDay;
  void _onMapCreated(HereMapController controller) {
    controller.mapScene.loadSceneForMapScheme(_scheme(context), (error) {
      if (!mounted || error == null) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Mappa HERE non disponibile')));
    });
  }
  @override Widget build(BuildContext context) => Stack(children: [
    ClipRRect(borderRadius: BorderRadius.circular(24), child: HereMap(onMapCreated: _onMapCreated)),
    Positioned(top: 12, right: 12, child: DecoratedBox(
      decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface.withValues(alpha: .92), shape: BoxShape.circle),
      child: IconButton(tooltip: widget.followPosition ? 'Camera centrata' : 'Panoramica itinerario', icon: Icon(widget.followPosition ? Icons.my_location : Icons.fit_screen), onPressed: () {}),
    )),
    if (widget.routeSummary != null) Positioned(left: 16, right: 16, bottom: 12, child: Card(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12), child: Text(widget.routeSummary!, style: Theme.of(context).textTheme.titleMedium)))),
  ]);
}
