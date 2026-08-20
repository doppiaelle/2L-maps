import 'dart:convert';
import 'route_models.dart';

class HereRoutingRequest {
  const HereRoutingRequest({required this.route, this.transportMode = 'car'});
  final OrderedRoute route;
  final String transportMode;

  Uri uri({required String apiKey}) {
    final params = <String, String>{
      'transportMode': transportMode,
      'routingMode': 'fast',
      'return': 'polyline,summary,turnByTurnActions',
      'apiKey': apiKey,
    };
    for (var i = 0; i < route.stops.length; i++) {
      final stop = route.stops[i];
      final key = i == 0 ? 'origin' : (i == route.stops.length - 1 ? 'destination' : 'via');
      params[key] = '${stop.latitude},${stop.longitude}';
    }
    return Uri.https('router.hereapi.com', '/v8/routes', params);
  }

  String encodeStops() => jsonEncode(route.stops.map((stop) => stop.toJson()).toList());
}
