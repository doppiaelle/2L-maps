import 'dart:collection';
import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class AppDiagnostics {
  static const _maxEvents = 120;
  static final ListQueue<String> _events = ListQueue<String>();

  static void record(String message) {
    final line =
        '${DateTime.now().toUtc().toIso8601String()} ${sanitize(message)}';
    if (_events.length >= _maxEvents) {
      _events.removeFirst();
    }
    _events.addLast(line);
    debugPrint('[2LMaps] $line');
    developer.log(line, name: '2l_maps');
  }

  static String get snapshot => _events.join('\n');

  /// Keeps diagnostics useful without allowing credentials into copied logs.
  static String sanitize(String message) {
    var value = message.replaceAll(RegExp(r'[\r\n]+'), r'\n');
    value = value.replaceAll(
      RegExp(r'Bearer\s+[^\s]+', caseSensitive: false),
      'Bearer <redacted>',
    );
    value = value.replaceAll(
      RegExp(
        r'(?:api[_-]?key|access[_-]?key(?:[_-]?(?:id|secret))?|password|token)\s*[=:]\s*[^\s,;]+',
        caseSensitive: false,
      ),
      '<credential-redacted>',
    );
    return value.length > 600 ? '${value.substring(0, 600)}…' : value;
  }

  static void clear() {
    _events.clear();
  }

  static Future<void> copyToClipboard() async {
    await Clipboard.setData(ClipboardData(text: snapshot));
  }
}
