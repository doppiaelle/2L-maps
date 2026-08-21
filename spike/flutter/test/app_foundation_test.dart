import 'package:flutter_test/flutter_test.dart';

import '../lib/app.dart';
import '../lib/app_bootstrap.dart';

void main() {
  testWidgets('missing configuration is represented by a recoverable screen', (
    tester,
  ) async {
    const result = AppBootstrapResult(
      status: BootstrapStatus.missingConfiguration,
      config: AppBootstrapConfig(
        hereAccessKeyId: '',
        hereAccessKeySecret: '',
        supabaseUrl: '',
        supabaseAnonKey: '',
      ),
      message: 'Configura i servizi',
    );

    await tester.pumpWidget(TwolMapsApp(bootstrap: result));

    expect(find.text('Configurazione necessaria'), findsOneWidget);
    expect(find.text('Configura i servizi'), findsOneWidget);
  });

  testWidgets('foundation exposes the primary app destinations', (tester) async {
    const result = AppBootstrapResult(
      status: BootstrapStatus.ready,
      config: AppBootstrapConfig(
        hereAccessKeyId: 'id',
        hereAccessKeySecret: 'secret',
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'anon',
      ),
    );

    await tester.pumpWidget(TwolMapsApp(bootstrap: result));
    expect(find.text('Planner'), findsOneWidget);
    expect(find.text('Storico'), findsOneWidget);
    expect(find.text('Impostazioni'), findsOneWidget);
    expect(find.text('Navigazione'), findsOneWidget);
  });
}
