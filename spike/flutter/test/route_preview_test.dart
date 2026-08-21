import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import '../lib/navigation_models.dart';
import '../lib/route_preview.dart';

void main() {
  testWidgets('renders route summary and minimal external navigator action', (tester) async {
    var opened = false;
    await tester.pumpWidget(MaterialApp(
      home: RoutePreview(
        distanceMeters: 30560,
        durationSeconds: 3000,
        nextInstruction: const NavigationInstruction(action: 'turn-left', distanceMeters: 400),
        onOpenExternalNavigator: () => opened = true,
      ),
    ));
    expect(find.text('30.6 km'), findsOneWidget);
    expect(find.text('50 min'), findsOneWidget);
    await tester.tap(find.byTooltip('Open current stop in external navigator'));
    expect(opened, isTrue);
  });
}
