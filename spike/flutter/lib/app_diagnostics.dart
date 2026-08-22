import 'dart:collection';
import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class AppDiagnostics {
  static const _maxEvents = 120;
  static final ListQueue<String> _events = ListQueue<String>();

  static void record(String message) {
    final line = '${DateTime.now().toUtc().toIso8601String()} $message';
    if (_events.length >= _maxEvents) {
      _events.removeFirst();
    }
    _events.addLast(line);
    debugPrint('[2LMaps] $line');
    developer.log(line, name: '2l_maps');
  }

  static String get snapshot => _events.join('\n');

  static Future<void> copyToClipboard() async {
    await Clipboard.setData(ClipboardData(text: snapshot));
  }
}