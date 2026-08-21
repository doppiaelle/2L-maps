import 'package:flutter/material.dart';
import 'package:here_sdk/mapview.dart';
class HereMapScreen extends StatelessWidget { const HereMapScreen({super.key}); @override Widget build(BuildContext context)=>SizedBox(height:360,child:ClipRRect(borderRadius:BorderRadius.circular(24),child:HereMap(onMapCreated:(c){c.mapScene.loadSceneForMapScheme(MapScheme.normalDay,(e){if(e!=null){ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Mappa HERE non disponibile')));}});}))); }
