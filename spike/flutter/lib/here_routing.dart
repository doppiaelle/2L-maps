import 'dart:convert';

import 'route_models.dart';

class HereRoutingRequest {
  const HereRoutingRequest({required this.route, this.transportMode = 'car'});
  final OrderedRoute route;
  final String transportMode;

  Uri uri({required String apiKey}) {
    final pairs = <String, String>{
      'transportMode': transportMode,
      'routingMode': 'fast',
      'return': 'polyline,summary,turnByTurnActions',
      'apiKey': apiKey,
      'origin': _point(route.stops.first),
      'destination': _point(route.stops.last),
    };
    final query = <String>[];
    pairs.forEach((key, value) => query.add('${Uri.encodeQueryComponent(key)}=${Uri.encodeQueryComponent(value)}'));
    for (final stop in route.stops.sublist(1, route.stops.length - 1)) {
      query.add('via=${Uri.encodeQueryComponent(_point(stop))}');
    }
    return Uri.parse('https://router.hereapi.com/v8/routes?${query.join('&')}');
  }

  String encodeStops() => jsonEncode(route.stops.map((stop) => stop.toJson()).toList());

  String _point(Stop stop) => '${stop.latitude},${stop.longitude}';
}
